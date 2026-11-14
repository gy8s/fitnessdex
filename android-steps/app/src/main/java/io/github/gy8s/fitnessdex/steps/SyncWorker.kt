package io.github.gy8s.fitnessdex.steps

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class SyncWorker(appContext:Context,params:WorkerParameters):CoroutineWorker(appContext,params){
 override suspend fun doWork():Result{
   if(TokenStore.get(applicationContext)==null)return Result.success()
   return try{
     if(HealthConnectClient.getSdkStatus(applicationContext)!=HealthConnectClient.SDK_AVAILABLE)
       return Result.success()
     val hc=HealthConnectClient.getOrCreate(applicationContext)
     if(hc.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)
       !=HealthConnectFeatures.FEATURE_STATUS_AVAILABLE)return Result.success()
     val granted=hc.permissionController.getGrantedPermissions()
     if(HealthPermission.getReadPermission(StepsRecord::class) !in granted ||
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND !in granted)return Result.success()
     StepSync.sync(applicationContext)
     Result.success()
   }catch(_:Exception){
     if(runAttemptCount<3)Result.retry() else Result.failure()
   }
 }
 companion object{
   private const val NAME="fitnessdex_health_connect_step_sync"
 private const val OPEN_NAME="fitnessdex_update_steps_on_open"
   fun schedule(context:Context){
     val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
     val request=PeriodicWorkRequestBuilder<SyncWorker>(15,TimeUnit.MINUTES).setConstraints(constraints).build()
     WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME,ExistingPeriodicWorkPolicy.UPDATE,request)
   }
   fun syncOnOpen(context:Context){
     // The minimum 15-minute periodic interval alone cannot refresh the app on launch.
     // Avoid spamming the device when Chrome/TWA restores several activities in succession.
     if(TokenStore.get(context)==null||System.currentTimeMillis()-TokenStore.lastSync(context)<60_000L)return
     val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
     val request=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(constraints).build()
     WorkManager.getInstance(context).enqueueUniqueWork(OPEN_NAME,ExistingWorkPolicy.KEEP,request)
   }
   fun cancel(context:Context){
     WorkManager.getInstance(context).cancelUniqueWork(NAME)
     WorkManager.getInstance(context).cancelUniqueWork(OPEN_NAME)
   }
 }
}
