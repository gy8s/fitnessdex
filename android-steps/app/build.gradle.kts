plugins {
 id("com.android.application")
 id("org.jetbrains.kotlin.android")
}
android {
 namespace = "io.github.gy8s.fitnessdex.steps"
 compileSdk = 36
 defaultConfig {
   applicationId = "io.github.gy8s.fitnessdex.steps"
   minSdk = 28
   targetSdk = 35
   versionCode = 7
   versionName = "0.2.3"
 }
 compileOptions {
   sourceCompatibility = JavaVersion.VERSION_17
   targetCompatibility = JavaVersion.VERSION_17
 }
}
kotlin {
 compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}
dependencies {
 implementation("androidx.health.connect:connect-client:1.1.0")
 implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
 implementation("androidx.activity:activity-ktx:1.13.0")
 implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
 implementation("androidx.work:work-runtime-ktx:2.12.0")
 implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
