package io.github.gy8s.fitnessdex.steps

import android.os.Bundle
import com.google.androidbrowserhelper.trusted.LauncherActivity

/** Main FitnessDex icon. Refresh native steps when the user opens the app. */
class FitnessDexLauncherActivity : LauncherActivity() {
 override fun onCreate(savedInstanceState:Bundle?) {
   super.onCreate(savedInstanceState)
   if(TokenStore.get(this)!=null)SyncWorker.syncOnOpen(applicationContext)
 }
}
