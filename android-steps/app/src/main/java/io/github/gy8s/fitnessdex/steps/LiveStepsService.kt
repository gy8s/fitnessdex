package io.github.gy8s.fitnessdex.steps

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZoneId
import java.time.Instant

/** Short-lived provisional step updates while an exercise session is running.
 *  Health Connect interval aggregates remain the authoritative session steps. */
class LiveStepsService:Service(),SensorEventListener{
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 private val lock=Any()
 private var manager:SensorManager?=null
 private var firstSensor:Long?=null
 private var lastSensor:Long?=null
 private var sessionSteps=0L
 private var baseDay=0L
 private var day=LocalDate.now()
 @Volatile private var phase="active"
 @Volatile private var currentSession=""
 private val channel="fitnessdex_live_steps"
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onCreate(){
   super.onCreate()
   val notifications=getSystemService(NotificationManager::class.java)
   notifications.createNotificationChannel(NotificationChannel(channel,"Live step tracking",NotificationManager.IMPORTANCE_LOW))
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
   val id=intent?.getStringExtra("session")?:""
   if(!Regex("^[a-fA-F0-9-]{36}$").matches(id)||
     TokenStore.get(this)==null||
     checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION)!=PackageManager.PERMISSION_GRANTED){
     stopSelf();return START_NOT_STICKY
   }
   if(currentSession==id)return START_NOT_STICKY
   currentSession=id
   val notification=Notification.Builder(this,channel)
     .setContentTitle("FitnessDex is tracking your steps")
     .setContentText("Live estimate during your walk, hike or run")
     .setSmallIcon(R.drawable.ic_fd)
     .setOngoing(true).build()
   if(Build.VERSION.SDK_INT>=34)startForeground(73,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
   else startForeground(73,notification)
   val sensorManager=getSystemService(Context.SENSOR_SERVICE) as SensorManager
   val counter=sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
   if(counter==null||!sensorManager.registerListener(this,counter,SensorManager.SENSOR_DELAY_NORMAL)){
     stopSelf();return START_NOT_STICKY
   }
   manager=sensorManager
   scope.launch{
     try{
       baseDay=readDay(day)?:0L
       while(isActive&&currentSession==id){
         sendUpdate(id)
         delay(10000)
       }
     }catch(_:Exception){
       // Keep the session timer in the cloud; this is an optional live preview.
     }finally{stopSelf()}
   }
   return START_NOT_STICKY
 }
 override fun onSensorChanged(event:SensorEvent){
   if(event.sensor.type!=Sensor.TYPE_STEP_COUNTER)return
   val count=event.values.getOrNull(0)?.toLong()?:return
   synchronized(lock){
     val last=lastSensor
     if(last!=null){
       val delta=count-last
       if(delta in 1..20000 && phase=="active")sessionSteps+=delta
     }else firstSensor=count
     lastSensor=count
   }
 }
 override fun onAccuracyChanged(sensor:Sensor?,accuracy:Int){}
 private suspend fun readDay(localDay:LocalDate):Long?{
   val client=HealthConnectClient.getOrCreate(this)
   val zone=ZoneId.systemDefault()
   val from=localDay.atStartOfDay(zone).toInstant()
   val end=localDay.plusDays(1).atStartOfDay(zone).toInstant()
   val now=Instant.now()
   val aggregate=client.aggregate(AggregateRequest(
     metrics=setOf(StepsRecord.COUNT_TOTAL),
     timeRangeFilter=TimeRangeFilter.between(from,if(end.isBefore(now))end else now)
   ))
   return aggregate[StepsRecord.COUNT_TOTAL]
 }
 private suspend fun sendUpdate(id:String){
   val today=LocalDate.now()
   if(today!=day){
     day=today
     baseDay=readDay(today)?:0L
     synchronized(lock){firstSensor=lastSensor}
   }
   val token=TokenStore.get(this)?:run{stopSelf();return}
   val counts=synchronized(lock){
     val delta=if(firstSensor!=null&&lastSensor!=null) (lastSensor!!-firstSensor!!).coerceAtLeast(0L) else 0L
     Pair((baseDay+delta).coerceIn(0L,150000L),sessionSteps.coerceIn(0L,150000L))
   }
   val connection=URL("https://ntepqkhftnnwtowpuggt.supabase.co/functions/v1/fitnessdex-steps/live-upload")
     .openConnection() as HttpURLConnection
   try{
     connection.requestMethod="POST"
     connection.doOutput=true
     connection.connectTimeout=10000
     connection.readTimeout=10000
     connection.setRequestProperty("Authorization","Bearer "+token)
     connection.setRequestProperty("Content-Type","application/json")
     val body=JSONObject()
       .put("sessionId",id).put("day",day.toString())
       .put("dailySteps",counts.first).put("sessionSteps",counts.second)
       .toString().toByteArray(Charsets.UTF_8)
     connection.outputStream.use{it.write(body)}
     val response=connection.responseCode
     if(response==409||response==401){
       stopSelf();return
     }
     if(response in 200..299){
       val text=connection.inputStream.bufferedReader().use{it.readText()}
       phase=JSONObject(text).optString("state","active")
     }
   }finally{connection.disconnect()}
 }
 override fun onDestroy(){
   manager?.unregisterListener(this)
   scope.cancel()
   super.onDestroy()
 }
}
