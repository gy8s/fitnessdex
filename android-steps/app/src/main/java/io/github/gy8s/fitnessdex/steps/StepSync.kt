package io.github.gy8s.fitnessdex.steps

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZoneId

data class StepDay(val day:LocalDate,val steps:Long,val hasRecords:Boolean)

object StepSync {
 private const val UPLOAD="https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitnessdex-steps/upload"
 suspend fun readSevenDays(context:Context):List<StepDay>{
   val hc=HealthConnectClient.getOrCreate(context)
   val zone=ZoneId.systemDefault()
   val today=LocalDate.now(zone)
   val totals=mutableListOf<StepDay>()
   for(i in 6L downTo 0L){
     val day=today.minusDays(i)
     val start=day.atStartOfDay(zone).toInstant()
     val end=day.plusDays(1).atStartOfDay(zone).toInstant()
     val result=hc.aggregate(AggregateRequest(metrics=setOf(StepsRecord.COUNT_TOTAL),
       timeRangeFilter=TimeRangeFilter.between(start,end)))
     val count=result[StepsRecord.COUNT_TOTAL]
     totals+=StepDay(day,(count?:0L).coerceAtLeast(0L),count!=null)
   }
   return totals
 }
 suspend fun sync(context:Context):List<StepDay>{
   val token=TokenStore.get(context)?:throw IOException("Pair with FitnessDex first.")
   val days=readSevenDays(context).filter{it.hasRecords}
   // Missing Health Connect records must never be published as an all-zero success.
   if(days.isEmpty())throw IOException("No step records found in Health Connect. Check Health Connect > Data and access > Activity > Steps; then allow Samsung Health to write Steps and reopen Samsung Health.")
   withContext(Dispatchers.IO){
     val values=JSONArray()
     days.forEach{values.put(JSONObject().put("day",it.day.toString()).put("steps",it.steps))}
     val body=JSONObject().put("days",values).toString().toByteArray(Charsets.UTF_8)
     val conn=URL(UPLOAD).openConnection() as HttpURLConnection
     try{
       conn.requestMethod="POST"
       conn.doOutput=true
       conn.connectTimeout=12000
       conn.readTimeout=12000
       conn.setRequestProperty("Content-Type","application/json")
       conn.setRequestProperty("Authorization","Bearer "+token)
       conn.outputStream.use{it.write(body)}
       if(conn.responseCode !in 200..299){
         val txt=conn.errorStream?.bufferedReader()?.use{it.readText()}?:""
         val reason=try{JSONObject(txt).optString("error")}catch(_:Exception){""}
         throw IOException(if(reason.isNotBlank())reason else "Upload failed ("+conn.responseCode+").")
       }
     }finally{conn.disconnect()}
   }
   TokenStore.markSynced(context)
   return days
 }
}
