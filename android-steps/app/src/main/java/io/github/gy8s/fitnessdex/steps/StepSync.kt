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
import java.time.Instant
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
   // Session steps are independently measured over each Start/Resume → Pause/Finish window.
   // They must never be added to the separate daily total (which already includes them).
   syncMovementSegments(context,token)
   TokenStore.markSynced(context)
   return days
 }
 private suspend fun syncMovementSegments(context:Context,token:String){
   val segments=withContext(Dispatchers.IO){
     val connection=URL("https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitnessdex-steps/segment-list")
       .openConnection() as HttpURLConnection
     try{
       connection.requestMethod="POST"
       connection.doOutput=true
       connection.connectTimeout=12000
       connection.readTimeout=12000
       connection.setRequestProperty("Content-Type","application/json")
       connection.setRequestProperty("Authorization","Bearer "+token)
       connection.outputStream.use{it.write("{}".toByteArray(Charsets.UTF_8))}
       val status=connection.responseCode
       if(status !in 200..299)throw IOException("Movement interval fetch failed ($status).")
       val payload=connection.inputStream.bufferedReader().use{it.readText()}
       JSONObject(payload).optJSONArray("segments")?:JSONArray()
     }finally{connection.disconnect()}
   }
   if(segments.length()==0)return
   val hc=HealthConnectClient.getOrCreate(context)
   val now=Instant.now()
   val samples=JSONArray()
   var processed=0
   for(i in 0 until segments.length()){
     if(processed>=20)break
     val row=segments.optJSONObject(i)?:continue
     val id=row.optString("id")
     val started=try{Instant.parse(row.optString("started_at"))}catch(_:Exception){continue}
     val finished=try{Instant.parse(row.optString("ended_at"))}catch(_:Exception){null}
     val measured=try{Instant.parse(row.optString("steps_synced_at"))}catch(_:Exception){null}
     if(finished!=null&&measured!=null&&measured.isAfter(finished.plusSeconds(300)))continue
     val end=if(finished!=null&&finished.isBefore(now))finished else now
     if(!end.isAfter(started))continue
     processed++
     val response=hc.aggregate(AggregateRequest(
       metrics=setOf(StepsRecord.COUNT_TOTAL),
       timeRangeFilter=TimeRangeFilter.between(started,end)))
     val count=response[StepsRecord.COUNT_TOTAL]
     if(count==null&&(finished==null||now.isBefore(finished.plusSeconds(180))))continue
     samples.put(JSONObject().put("id",id).put("steps",(count?:0L).coerceIn(0L,150000L)))
   }
   if(samples.length()==0)return
   withContext(Dispatchers.IO){
     val connection=URL("https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitnessdex-steps/segment-upload")
       .openConnection() as HttpURLConnection
     try{
       connection.requestMethod="POST"
       connection.doOutput=true
       connection.connectTimeout=12000
       connection.readTimeout=12000
       connection.setRequestProperty("Content-Type","application/json")
       connection.setRequestProperty("Authorization","Bearer "+token)
       val bytes=JSONObject().put("samples",samples).toString().toByteArray(Charsets.UTF_8)
       connection.outputStream.use{it.write(bytes)}
       val status=connection.responseCode
       if(status !in 200..299)throw IOException("Movement steps upload failed ($status).")
     }finally{connection.disconnect()}
   }
 }

}
