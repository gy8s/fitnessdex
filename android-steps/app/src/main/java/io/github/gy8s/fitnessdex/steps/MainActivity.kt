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
 private lateinit var status:TextView
 private lateinit var result:TextView
 private lateinit var tokenInput:EditText
 private var syncing=false

 private val stepPermissionPrompt=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){granted->
   if(stepsPermission in granted)syncNow() else status("Step permission declined; nothing was uploaded.")
 }
 private val backgroundPermissionPrompt=registerForActivityResult(PermissionController.createRequestPermissionResultContract()){granted->
   if(backgroundPermission in granted){
     SyncWorker.schedule(this)
     status("Background sync enabled. Android schedules an update approximately every 3 hours.")
   }else status("Background access was declined. Manual syncing still works.")
 }
 private fun dp(value:Int)=(resources.displayMetrics.density*value).toInt()
 private fun status(message:String){if(::status.isInitialized)status.text=message}
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
   text(root,"1. Open FitnessDex → More → Daily steps. Create and copy a pairing code.",14f,"#E5EDF2",18)
   text(root,"2. Paste the code here. It is encrypted on this phone.",14f,"#E5EDF2",10)
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
       status("Code saved securely. Allow access to steps and sync.")
     }catch(e:Exception){status(e.message?:"Pairing code is invalid.")}
   }
   text(root,"3. Grant read-only Health Connect permission and sync.",14f,"#E5EDF2",16)
   button(root,"Allow steps and sync now"){allowOrSync()}
   button(root,"Enable automatic background sync (optional)"){enableBackground()}
   button(root,"Open FitnessDex"){
     startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://gy8s.github.io/fitnessdex/")))
   }
   button(root,"Clear pairing from this phone"){
     TokenStore.clear(this)
     SyncWorker.cancel(this)
     status("Local pairing cleared. To revoke cloud access, also unlink under FitnessDex → Daily steps.")
   }
   status=text(root,"Checking Health Connect…",14f,"#AAE8D5",19)
   result=text(root,"",15f,"#E3F4F6",8)
   text(root,"Background access needs a second Health Connect permission. Android may delay background work due to battery settings; use manual sync whenever needed.",12f,"#A6BDC9",14)
   val scroll=ScrollView(this).apply{isFillViewport=true;addView(root)}
   setContentView(scroll)
   status(when{
     HealthConnectClient.getSdkStatus(this)!=HealthConnectClient.SDK_AVAILABLE->"Health Connect unavailable. Update it through Android Settings."
     TokenStore.get(this)==null->"Health Connect ready. Pair this device to begin."
     else->"Pairing code saved. Tap Allow steps and sync now."
   })
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
   val hc=health()?:return
   if(hc.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)
     !=HealthConnectFeatures.FEATURE_STATUS_AVAILABLE){
     status("This Health Connect version does not allow background reads. Manual syncing still works.")
     return
   }
   lifecycleScope.launch{
     try{
       val granted=hc.permissionController.getGrantedPermissions()
       if(stepsPermission !in granted)status("Please grant step access using the button above first.")
       else if(backgroundPermission in granted){
         SyncWorker.schedule(this@MainActivity)
         status("Automatic background sync enabled.")
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
       val current=days.lastOrNull()
       status("Seven days synced to FitnessDex successfully.")
       result.text="Today: "+String.format(Locale.UK,"%,d",current?.steps?:0L)+" steps\n"+
         "Date: "+(current?.day?:LocalDate.now())+"\nOpen FitnessDex → Daily steps → Refresh steps."
     }catch(e:Exception){status("Sync failed: "+(e.message?:"Unknown error"))}
     finally{syncing=false}
   }
 }
 override fun onResume(){
   super.onResume()
   if(!::status.isInitialized||TokenStore.get(this)==null||syncing||
     System.currentTimeMillis()-TokenStore.lastSync(this)<=3*3600_000L)return
   val hc=health()?:return
   lifecycleScope.launch{
     try{if(stepsPermission in hc.permissionController.getGrantedPermissions())syncNow()}
     catch(_:Exception){/* A user may revoke Health Connect permissions. */}
   }
 }
}
