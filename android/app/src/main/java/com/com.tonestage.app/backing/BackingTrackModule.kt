package com.tonestage.app.backing

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.tonestage.app.yi.NativeBackingTrackSpec
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Implements NativeBackingTrackSpec (see specs/NativeBackingTrack.ts). The generated spec classes all
 * live in the package set by codegenConfig (com.tonestage.app.yi), hence the import above.
 */
class BackingTrackModule(reactContext: ReactApplicationContext) :
    NativeBackingTrackSpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val engine = BackingTrackEngine(reactContext.applicationContext)
  private var pickPromise: Promise? = null

  private val activityListener =
      object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
          if (requestCode != REQUEST_PICK) {
            return
          }
          val promise = pickPromise ?: return
          pickPromise = null
          val picked = data?.data
          if (resultCode != Activity.RESULT_OK || picked == null) {
            promise.resolve(JSONObject().put("ok", false).put("error", "CANCELLED").toString())
            return
          }
          try {
            getReactApplicationContext()
                .contentResolver
                .takePersistableUriPermission(picked, Intent.FLAG_GRANT_READ_URI_PERMISSION)
          } catch (ignored: SecurityException) {
            // Some providers do not allow keeping access; the file can still be used this session.
          }
          prefs().edit().putString(PREF_URI, picked.toString()).apply()
          val json = JSONObject()
          json.put("ok", true)
          json.put("error", "")
          json.put("uri", picked.toString())
          json.put("name", displayName(picked))
          promise.resolve(json.toString())
        }
      }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName() = NAME

  private fun prefs() =
      getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun audioManager(): AudioManager =
      getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun displayName(uri: Uri): String {
    try {
      getReactApplicationContext()
          .contentResolver
          .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
          ?.use { cursor ->
            if (cursor.moveToFirst()) {
              val value = cursor.getString(0)
              if (!value.isNullOrEmpty()) {
                return value
              }
            }
          }
    } catch (ignored: Exception) {}
    return uri.lastPathSegment ?: "audio"
  }

  // ---- file -----------------------------------------------------------------------------------

  override fun pickFile(promise: Promise) {
    val activity = getReactApplicationContext().currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No foreground activity")
      return
    }
    if (pickPromise != null) {
      promise.reject("BUSY", "A file is already being picked")
      return
    }
    pickPromise = promise
    try {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
      intent.addCategory(Intent.CATEGORY_OPENABLE)
      intent.type = "audio/*"
      intent.addFlags(
          Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
      )
      activity.startActivityForResult(intent, REQUEST_PICK)
    } catch (e: Exception) {
      pickPromise = null
      promise.reject("PICK_FAILED", e.message ?: "Could not open the file picker")
    }
  }

  override fun getLastFile(promise: Promise) {
    try {
      val saved = prefs().getString(PREF_URI, null)
      if (saved == null) {
        promise.resolve(JSONObject().put("ok", false).toString())
        return
      }
      val uri = Uri.parse(saved)
      // Only offer the file if Android still lets this app read it.
      val allowed =
          getReactApplicationContext().contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission
          }
      if (!allowed) {
        promise.resolve(JSONObject().put("ok", false).toString())
        return
      }
      val json = JSONObject()
      json.put("ok", true)
      json.put("uri", saved)
      json.put("name", displayName(uri))
      promise.resolve(json.toString())
    } catch (e: Exception) {
      promise.resolve(JSONObject().put("ok", false).toString())
    }
  }

  override fun load(uri: String, promise: Promise) {
    executor.execute {
      try {
        val parsed = Uri.parse(uri)
        promise.resolve(engine.load(parsed, displayName(parsed)).toString())
      } catch (e: Exception) {
        promise.reject("BACKING_ERROR", e.message ?: "Could not load the file")
      }
    }
  }

  // ---- transport ----------------------------------------------------------------------------------

  override fun play(promise: Promise) {
    executor.execute {
      engine.play()
      promise.resolve(null)
    }
  }

  override fun pause(promise: Promise) {
    engine.pause()
    promise.resolve(null)
  }

  override fun stop(promise: Promise) {
    executor.execute {
      engine.stop()
      promise.resolve(null)
    }
  }

  override fun seekTo(positionMs: Double, promise: Promise) {
    engine.seekTo(positionMs.toLong())
    promise.resolve(null)
  }

  override fun setGain(volume: Double, muted: Boolean, promise: Promise) {
    engine.setGain(volume.toFloat(), muted)
    promise.resolve(null)
  }

  override fun setMasterGain(volume: Double, promise: Promise) {
    engine.setMasterGain(volume.toFloat())
    promise.resolve(null)
  }

  override fun setEq(json: String, promise: Promise) {
    try {
      val root = JSONObject(json)
      val bands = ArrayList<EqBandSettings>()
      val array = root.optJSONArray("bands") ?: JSONArray()
      for (i in 0 until array.length()) {
        val band = array.optJSONObject(i) ?: continue
        bands.add(
            EqBandSettings(
                band.optString("kind", "peak"),
                band.optBoolean("enabled", false),
                band.optDouble("freq", 1000.0).toFloat(),
                band.optDouble("gainDb", 0.0).toFloat(),
                band.optDouble("q", 1.0).toFloat(),
            )
        )
      }
      engine.setEq(EqSettings(root.optBoolean("enabled", false), bands))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("BAD_EQ", e.message ?: "Invalid equalizer settings")
    }
  }

  override fun loadSettings(promise: Promise) {
    promise.resolve(prefs().getString(PREF_MIXER, "") ?: "")
  }

  override fun saveSettings(json: String, promise: Promise) {
    prefs().edit().putString(PREF_MIXER, json).apply()
    promise.resolve(null)
  }

  override fun unload(promise: Promise) {
    executor.execute {
      engine.unload()
      promise.resolve(null)
    }
  }

  // ---- output devices ------------------------------------------------------------------------------

  override fun getOutputDevices(promise: Promise) {
    try {
      val result = JSONArray()
      for (device in audioManager().getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
        val json = JSONObject()
        json.put("id", device.id)
        json.put("name", device.productName?.toString() ?: "")
        json.put("type", typeName(device.type))
        json.put(
            "isUsb",
            device.type == AudioDeviceInfo.TYPE_USB_DEVICE ||
                device.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
                device.type == AudioDeviceInfo.TYPE_USB_ACCESSORY,
        )
        json.put("address", if (Build.VERSION.SDK_INT >= 28) device.address else "")
        result.put(json)
      }
      promise.resolve(result.toString())
    } catch (e: Exception) {
      promise.reject("AUDIO_ERROR", e.message ?: "Could not list output devices")
    }
  }

  override fun setOutputDevice(deviceId: Double, promise: Promise) {
    try {
      val id = deviceId.toInt()
      val device =
          if (id < 0) {
            null
          } else {
            audioManager().getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.id == id }
          }
      if (id >= 0 && device == null) {
        promise.reject("DEVICE_NOT_FOUND", "Output device $id is not connected")
        return
      }
      engine.setOutputDevice(device)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("AUDIO_ERROR", e.message ?: "Could not select the output device")
    }
  }

  override fun getStatus(promise: Promise) {
    promise.resolve(engine.snapshot().toString())
  }

  override fun invalidate() {
    getReactApplicationContext().removeActivityEventListener(activityListener)
    engine.unload()
    executor.shutdownNow()
    super.invalidate()
  }

  private fun typeName(type: Int): String =
      when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "BUILTIN_SPEAKER"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "BUILTIN_EARPIECE"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "WIRED_HEADSET"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "WIRED_HEADPHONES"
        AudioDeviceInfo.TYPE_LINE_ANALOG -> "LINE_ANALOG"
        AudioDeviceInfo.TYPE_USB_DEVICE -> "USB_DEVICE"
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB_ACCESSORY"
        AudioDeviceInfo.TYPE_USB_HEADSET -> "USB_HEADSET"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "BLUETOOTH_A2DP"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "BLUETOOTH_SCO"
        AudioDeviceInfo.TYPE_HDMI -> "HDMI"
        AudioDeviceInfo.TYPE_TELEPHONY -> "TELEPHONY"
        else -> "TYPE_$type"
      }

  companion object {
    const val NAME = "NativeBackingTrack"
    private const val REQUEST_PICK = 7301
    private const val PREFS = "tonestage"
    private const val PREF_URI = "backing_track_uri"
    private const val PREF_MIXER = "mixer_settings"
  }
}