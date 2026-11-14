package io.github.gy8s.fitnessdex.steps

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.Locale

class MainActivity:ComponentActivity(){
 private val stepsPermission=HealthPermission.getReadPermission(StepsRecord::class)
 private val backgroundPermission=HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
 private lateinit var automationView:TextView
 private lateinit var statusView:TextView
 private lateinit var result:TextView
 private lateinit var tokenInput:EditText
 private var syncing=false
 private var firstPairing=false

 private val stepPermissionPrompt=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){granted->
   if(stepsPermission in granted){
     if(firstPairing){firstPairing=false;enableBackground()}
     syncNow()
   }else{
     firstPairing=false
     status("Step permission declined; nothing was uploaded.")
   }
 }
 private val backgroundPermissionPrompt=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){granted->
   if(backgroundPermission in granted){
     SyncWorker.schedule(this)
     autoStatus("Automatic sync ON · checks roughly every 15 minutes (Android may delay)")
     status("Automatic syncing enabled. You can close this app; FitnessDex will refresh cloud totals automatically.")
    }else{
     autoStatus("Automatic sync OFF · background access not allowed")
     status("Background access was declined. You can still sync when opening FitnessDex step setup.")
   }
 }
 private fun dp(value:Int)=(resources.displayMetrics.density*value).toInt()
 private fun status(message:String){if(::statusView.isInitialized)statusView.text=message}
 private fun autoStatus(message:String){if(::automationView.isInitialized)automationView.text=message}
 private fun text(parent:LinearLayout,label:String,size:Float,color:String,top:Int=0):TextView{
   val t=TextView(this).apply{
     text=label;textSize=size;setTextColor(Color.parseColor(color))
     setPadding(0,dp(top),0,dp(6))
   }
   parent.addView(t)
   return t
 }
 private fun button(parent:LinearLayout,label:String,click:()->Unit){
   val b=Button(this).apply{
     text=label;isAllCaps=false
     setTextColor(Color.WHITE)
     backgroundTintList=ColorStateList.valueOf(Color.rgb(27,110,99))
     setOnClickListener{click()}
   }
   parent.addView(b,LinearLayout.LayoutParams(-1,dp(53)).apply{topMargin=dp(9)})
 }
 override fun onCreate(savedInstanceState:Bundle?){
   super.onCreate(savedInstanceState)
   window.statusBarColor=Color.rgb(11,24,38)
   window.navigationBarColor=Color.rgb(11,24,38)
   val root=LinearLayout(this).apply{
     orientation=LinearLayout.VERTICAL
     setPadding(dp(21),dp(24),dp(21),dp(40))
     setBackgroundColor(Color.rgb(11,24,38))
   }
   text(root,"FD  /  FITNESSDEX",14f,"#8AEACD")
   text(root,"Connect your steps",28f,"#F4FCFF",10)
   text(root,"Read-only daily step totals from Health Connect. FitnessDex exercise logs stay unchanged.",14f,"#B4CAD8",9)
   text(root,"Normally, connecting from FitnessDex pairs this screen automatically. One app, one account.",14f,"#E5EDF2",18)
   text(root,"If automatic pairing fails, you can paste a private pairing code here instead.",14f,"#E5EDF2",10)
   tokenInput=EditText(this).apply{
     hint="Paste FitnessDex pairing code"
     setHintTextColor(Color.rgb(142,162,174))
     setTextColor(Color.WHITE)
     isSingleLine=true
     inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
   }
   root.addView(tokenInput,LinearLayout.LayoutParams(-1,dp(56)))
   button(root,"Save private pairing code"){
     try{
       TokenStore.save(this,tokenInput.text.toString())
       tokenInput.text.clear()
       status("Paired securely. Checking step permission and syncing…")
       allowOrSync()
     }catch(e:Exception){status(e.message?:"Pairing code is invalid.")}
   }
   text(root,"Allow read-only Health Connect step access once. Background uploads run inside this same app.",14f,"#E5EDF2",16)
   button(root,"Enable automatic syncing · one-time setup"){enableBackground()}
   button(root,"Sync now (optional)"){allowOrSync()}
   button(root,"Back to FitnessDex"){finish()}
   button(root,"Clear pairing from this phone"){
     TokenStore.clear(this)
     SyncWorker.cancel(this)
     autoStatus("Automatic sync OFF · device unpaired")
     status("Local pairing cleared. To revoke cloud access, also unlink under FitnessDex → Daily steps.")
   }
   automationView=text(root,"Automatic sync: checking permissions…",14f,"#91F0D5",16)
   statusView=text(root,"Checking Health Connect…",14f,"#AAE8D5",19)
   result=text(root,"",15f,"#E3F4F6",8)
   text(root,"If step totals are missing, inspect Health Connect → Data and access → Activity → Steps. Samsung Health must have permission to WRITE steps there. Android may delay background work.",12f,"#A6BDC9",14)
   val scroll=ScrollView(this).apply{isFillViewport=true;addView(root)}
   setContentView(scroll)
   status(when{
     HealthConnectClient.getSdkStatus(this)!=HealthConnectClient.SDK_AVAILABLE->"Health Connect unavailable. Update it through Android Settings."
     TokenStore.get(this)==null->"Health Connect ready. Pair this device to begin."
     else->"Device paired. Step uploads can run automatically in the background."
   })
   val incoming=intent?.data
   if(intent?.action==Intent.ACTION_VIEW&&incoming?.scheme=="fitnessdex"&&
      incoming.host=="steps"&&incoming.path=="/connect"){
     val token=incoming.getQueryParameter("token")?:""
     intent?.data=null
     if(Regex("^[A-Za-z0-9_-]{43}$").matches(token)){
       try{
         TokenStore.save(this,token)
         firstPairing=true
         status("Paired. Requesting permission to read steps…")
         window.decorView.post{allowOrSync()}
       }catch(e:Exception){status("Could not pair: "+(e.message?:"Unknown error"))}
     }else status("Invalid link. Create a new pairing link in FitnessDex.")
   }
 }
 private fun health():HealthConnectClient?{
   if(HealthConnectClient.getSdkStatus(this)!=HealthConnectClient.SDK_AVAILABLE){
     status("Health Connect is unavailable on this phone.")
     return null
   }
   return HealthConnectClient.getOrCreate(this)
 }
 private fun allowOrSync(){
   val hc=health()?:return
   lifecycleScope.launch{
     try{
       if(stepsPermission in hc.permissionController.getGrantedPermissions())syncNow()
       else stepPermissionPrompt.launch(setOf(stepsPermission))
     }catch(e:Exception){status("Could not request step access: "+(e.message?:"Unknown"))}
   }
 }
 private fun enableBackground(){
   if(TokenStore.get(this)==null){status("Save your private pairing code first.");return}
   val hc=health()?:return
   if(hc.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)
     !=HealthConnectFeatures.FEATURE_STATUS_AVAILABLE){
     autoStatus("Automatic sync unavailable on this Health Connect version")
     status("This Health Connect version does not allow background reads. Sync when you open this companion.")
     return
   }
   lifecycleScope.launch{
     try{
       val granted=hc.permissionController.getGrantedPermissions()
       if(stepsPermission !in granted)status("Grant Health Connect step access using Sync now first, then enable automatic syncing.")
       else if(backgroundPermission in granted){
         SyncWorker.schedule(this@MainActivity)
         autoStatus("Automatic sync ON · checks roughly every 15 minutes (Android may delay)")
         status("Automatic syncing enabled. FitnessDex refreshes its displayed totals automatically.")
       }else backgroundPermissionPrompt.launch(setOf(backgroundPermission))
     }catch(e:Exception){status("Could not enable background access: "+(e.message?:"Unknown"))}
   }
 }
 private fun syncNow(){
   if(syncing)return
   if(TokenStore.get(this)==null){status("Save a FitnessDex pairing code first.");return}
   syncing=true;status("Reading seven days and securely uploading daily step totals…")
   lifecycleScope.launch{
     try{
       val days=StepSync.sync(this@MainActivity)
       val current=days.find{it.day==LocalDate.now()}
       status(days.size.toString()+" day(s) of recorded steps synced to FitnessDex.")
       result.text="Today: "+(if(current!=null)String.format(Locale.UK,"%,d",current.steps)+" steps" else "No step records in Health Connect yet")+"\n"+
         "Date: "+(current?.day?:LocalDate.now())+"\nFitnessDex checks for updated cloud totals automatically."
     }catch(e:Exception){status("Sync failed: "+(e.message?:"Unknown error"))}
     finally{syncing=false}
   }
 }
 override fun onResume(){
   super.onResume()
   if(!::statusView.isInitialized)return
   if(TokenStore.get(this)==null){
     autoStatus("Automatic sync OFF · pair your device first")
     return
   }
   val hc=health()?:return
   lifecycleScope.launch{
     try{
       val granted=hc.permissionController.getGrantedPermissions()
       val allowed=stepsPermission in granted
       val automatic=allowed&&backgroundPermission in granted&&
         hc.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)==HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
       if(automatic){
         // Restore scheduling after an app update. UPDATE preserves the existing periodic work history.
         SyncWorker.schedule(this@MainActivity)
         autoStatus("Automatic sync ON · checks roughly every 15 minutes (Android may delay)")
       }else autoStatus("Automatic sync OFF · tap Enable automatic syncing once")
       // Opening the companion automatically catches up if a scheduled job was delayed.
       if(allowed&&!syncing&&System.currentTimeMillis()-TokenStore.lastSync(this@MainActivity)>=90_000L)syncNow()
     }catch(_:Exception){autoStatus("Cannot confirm automatic sync · check Health Connect permissions")}
   }
 }
}
