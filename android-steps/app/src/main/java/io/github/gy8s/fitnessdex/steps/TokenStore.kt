package io.github.gy8s.fitnessdex.steps

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Only Android Keystore can decrypt the saved step-upload pairing code. */
object TokenStore {
 private const val ALIAS="fitnessdex_steps_pair_aes"
 private const val PREF="fd_steps_secure"
 private const val TOKEN="pairing"
 private const val LAST_SYNC="last_sync"
 private fun key():SecretKey {
   val store=KeyStore.getInstance("AndroidKeyStore")
   store.load(null)
   val existing=store.getKey(ALIAS,null) as? SecretKey
   if(existing!=null)return existing
   val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore")
   generator.init(KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
     .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
     .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
     .setRandomizedEncryptionRequired(true).build())
   return generator.generateKey()
 }
 fun save(context:Context,raw:String) {
   val code=raw.trim()
   require(Regex("^[A-Za-z0-9_-]{43}$").matches(code)){"Pairing codes have 43 characters."}
   val cipher=Cipher.getInstance("AES/GCM/NoPadding")
   cipher.init(Cipher.ENCRYPT_MODE,key())
   val bytes=cipher.iv+cipher.doFinal(code.toByteArray(Charsets.UTF_8))
   context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit()
     .putString(TOKEN,Base64.encodeToString(bytes,Base64.NO_WRAP)).apply()
 }
 fun get(context:Context):String?{
   val saved=context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(TOKEN,null)?:return null
   return try{
     val data=Base64.decode(saved,Base64.NO_WRAP)
     if(data.size<29)return null
     val cipher=Cipher.getInstance("AES/GCM/NoPadding")
     cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,data.copyOfRange(0,12)))
     String(cipher.doFinal(data.copyOfRange(12,data.size)),Charsets.UTF_8)
   }catch(_:Exception){null}
 }
 fun clear(context:Context) {
   context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(TOKEN).remove(LAST_SYNC).apply()
 }
 fun lastSync(context:Context):Long=context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getLong(LAST_SYNC,0)
 fun markSynced(context:Context) {
   context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit()
     .putLong(LAST_SYNC,System.currentTimeMillis()).apply()
 }
}
