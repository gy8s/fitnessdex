package io.github.gy8s.fitnessdex.steps

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/** Health Connect's built-in privacy and permission-rationale destination. */
class PrivacyActivity:Activity(){
 override fun onCreate(savedInstanceState:Bundle?){
   super.onCreate(savedInstanceState)
   val text=TextView(this).apply{
     this.text="FitnessDex Steps — privacy\n\n"+
       "This small companion reads ONLY STEP COUNTS from Health Connect, with your permission. "+
       "It obtains seven days of aggregate daily totals and sends dates and counts via HTTPS "+
       "to your paired FitnessDex account.\n\n"+
       "No GPS, heart rate, sleep or medical records are accessed. "+
       "We do not collect raw movement events.\n\n"+
       "Background step access is separate and optional; without it, manual sync still works.\n\n"+
       "The upload-only device pairing code is encrypted using Android Keystore. "+
       "You can unlink it in FitnessDex under More → Daily steps, or remove it from this device.\n\n"+
       "Health Connect permissions can be revoked in Android Settings at any time. "+
       "Previously uploaded daily step totals remain saved in FitnessDex until deleted.\n\n"+
       "This is an open-source personal prototype, not a medical device."
     textSize=17f
     setTextColor(Color.WHITE)
     setBackgroundColor(Color.rgb(11,24,38))
     setPadding(42,50,42,50)
   }
   setContentView(ScrollView(this).apply{addView(text)})
 }
}
