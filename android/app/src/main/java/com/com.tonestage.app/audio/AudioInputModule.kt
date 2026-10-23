package com.tonestage.app.audio

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.tonestage.app.yi.NativeAudioInputSpec
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Implements NativeAudioInputSpec (see specs/NativeAudioInput.ts). The generated spec classes all
 * live in the package set by codegenConfig (com.tonestage.app.yi), hence the import above.
 */
class AudioInputModule(reactContext: ReactApplicationContext) : NativeAudioInputSpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private var player: MediaPlayer? = null
  private val meter = AudioMeter()

  override fun getName() = NAME

  private fun audioManager(): AudioManager =
      getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private fun findInput(deviceId: Int): AudioDeviceInfo? =
      audioManager().getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.id == deviceId }

  private fun hasMicPermission(): Boolean =
      getReactApplicationContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
          PackageManager.PERMISSION_GRANTED

  // ---- device list -------------------------------------------------------------------------

  override fun getInputDevices(promise: Promise) {
    try {
      val result = JSONArray()
      for (device in audioManager().getDevices(AudioManager.GET_DEVICES_INPUTS)) {
        result.put(describe(device))
      }
      promise.resolve(result.toString())
    } catch (e: Exception) {
      promise.reject("AUDIO_ERROR", e.message ?: "Could not list audio devices")
    }
  }

  // ---- probe: which formats can really be opened -----------------------------------------------

  override fun probeInput(deviceId: Double, promise: Promise) {
    executor.execute {
      try {
        meter.stop()
        if (!hasMicPermission()) {
          promise.reject("NO_PERMISSION", "RECORD_AUDIO is not granted")
          return@execute
        }
        val device = findInput(deviceId.toInt())
        if (device == null) {
          promise.reject("DEVICE_NOT_FOUND", "Input device ${deviceId.toInt()} is not connected")
          return@execute
        }
        val results = JSONArray()
        for (rate in intArrayOf(44100, 48000)) {
          for (channels in intArrayOf(1, 2)) {
            val outcome = AudioCapture.captureOnce(device, rate, channels, 1200, null)
            val entry = JSONObject()
            entry.put("sampleRate", rate)
            entry.put("channels", channels)
            entry.put("source", outcome.source)
            entry.put("ok", outcome.ok)
            entry.put("error", outcome.error)
            entry.put("actualSampleRate", outcome.actualSampleRate)
            entry.put("actualChannels", outcome.actualChannels)
            entry.put("routedToSelected", outcome.routedDeviceId == device.id)
            entry.put("frames", outcome.stats.frames)
            entry.put("peaks", outcome.stats.peaksJson())
            results.put(entry)
          }
        }
        promise.resolve(JSONObject().put("results", results).toString())
      } catch (e: Exception) {
        promise.reject("AUDIO_ERROR", e.message ?: "Probe failed")
      }
    }
  }

  // ---- test recording ----------------------------------------------------------------------

  override fun recordTest(
      deviceId: Double,
      sampleRate: Double,
      channelCount: Double,
      seconds: Double,
      promise: Promise,
  ) {
    executor.execute {
      var writer: WavWriter? = null
      var file: File? = null
      try {
        meter.stop()
        if (!hasMicPermission()) {
          promise.reject("NO_PERMISSION", "RECORD_AUDIO is not granted")
          return@execute
        }
        val device = findInput(deviceId.toInt())
        if (device == null) {
          promise.reject("DEVICE_NOT_FOUND", "Input device ${deviceId.toInt()} is not connected")
          return@execute
        }
        val rate = sampleRate.toInt()
        val channels = channelCount.toInt()
        file = File(getReactApplicationContext().cacheDir, "spm_test_${System.currentTimeMillis()}.wav")
        writer = WavWriter(file, rate, channels)
        val outcome =
            AudioCapture.captureOnce(device, rate, channels, (seconds * 1000).toLong(), writer)
        writer.close()
        writer = null

        val json = JSONObject()
        json.put("ok", outcome.ok)
        json.put("error", outcome.error)
        json.put("path", if (outcome.ok) file.absolutePath else "")
        json.put("source", outcome.source)
        json.put("sampleRate", outcome.actualSampleRate)
        json.put("channels", outcome.actualChannels)
        json.put("routedToSelected", outcome.routedDeviceId == device.id)
        json.put("frames", outcome.stats.frames)
        json.put("peaks", outcome.stats.peaksJson())
        json.put("rms", outcome.stats.rmsJson())
        json.put("clipped", outcome.stats.clippedJson())
        if (!outcome.ok) {
          file.delete()
        }
        promise.resolve(json.toString())
      } catch (e: Exception) {
        try {
          writer?.close()
        } catch (ignored: Exception) {}
        file?.delete()
        promise.reject("AUDIO_ERROR", e.message ?: "Recording failed")
      }
    }
  }

  // ---- live level meter ----------------------------------------------------------------------

  override fun startMeter(
      deviceId: Double,
      sampleRate: Double,
      channelCount: Double,
      promise: Promise,
  ) {
    executor.execute {
      try {
        if (!hasMicPermission()) {
          promise.reject("NO_PERMISSION", "RECORD_AUDIO is not granted")
          return@execute
        }
        val device = findInput(deviceId.toInt())
        if (device == null) {
          promise.reject("DEVICE_NOT_FOUND", "Input device ${deviceId.toInt()} is not connected")
          return@execute
        }
        promise.resolve(meter.start(device, sampleRate.toInt(), channelCount.toInt()).toString())
      } catch (e: Exception) {
        promise.reject("AUDIO_ERROR", e.message ?: "Could not start the meter")
      }
    }
  }

  override fun getMeterLevels(promise: Promise) {
    promise.resolve(meter.snapshot().toString())
  }

  override fun stopMeter(promise: Promise) {
    executor.execute {
      meter.stop()
      promise.resolve(null)
    }
  }

  // ---- playback (to listen to a test recording) --------------------------------------------------

  override fun playTest(path: String, promise: Promise) {
    executor.execute {
      try {
        stopPlayerLocked()
        val newPlayer = MediaPlayer()
        newPlayer.setDataSource(path)
        newPlayer.setOnCompletionListener { stopPlayerLocked() }
        newPlayer.prepare()
        newPlayer.start()
        player = newPlayer
        promise.resolve(null)
      } catch (e: Exception) {
        stopPlayerLocked()
        promise.reject("AUDIO_ERROR", e.message ?: "Playback failed")
      }
    }
  }

  override fun stopPlayback(promise: Promise) {
    executor.execute {
      stopPlayerLocked()
      promise.resolve(null)
    }
  }

  // ---- export to the public Download folder ------------------------------------------------

  override fun exportTest(path: String, promise: Promise) {
    executor.execute {
      try {
        if (Build.VERSION.SDK_INT < 29) {
          promise.reject("UNSUPPORTED", "Export needs Android 10 or newer")
          return@execute
        }
        val source = File(path)
        // Only files this module created in the cache folder may be exported.
        if (!source.exists() ||
            source.parentFile?.canonicalPath != getReactApplicationContext().cacheDir.canonicalPath) {
          promise.reject("FILE_NOT_FOUND", "Recording not found")
          return@execute
        }
        val resolver = getReactApplicationContext().contentResolver
        val values = ContentValues()
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, source.name)
        values.put(MediaStore.MediaColumns.MIME_TYPE, "audio/wav")
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ToneStage")
        val uri =
            resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Could not create the file in Downloads")
        val output = resolver.openOutputStream(uri) ?: throw IOException("Could not open the file")
        output.use { out -> source.inputStream().use { input -> input.copyTo(out) } }
        promise.resolve("Download/ToneStage/${source.name}")
      } catch (e: Exception) {
        promise.reject("AUDIO_ERROR", e.message ?: "Export failed")
      }
    }
  }

  @Synchronized
  private fun stopPlayerLocked() {
    val current = player
    player = null
    if (current != null) {
      try {
        current.stop()
      } catch (ignored: IllegalStateException) {}
      current.release()
    }
  }

  override fun invalidate() {
    meter.stop()
    stopPlayerLocked()
    executor.shutdownNow()
    super.invalidate()
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private fun describe(device: AudioDeviceInfo): JSONObject {
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
    json.put("channelCounts", JSONArray(device.channelCounts.toList()))
    json.put("sampleRates", JSONArray(device.sampleRates.toList()))
    json.put("encodings", JSONArray(device.encodings.map { encodingName(it) }))
    return json
  }

  private fun typeName(type: Int): String =
      when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> "BUILTIN_MIC"
        AudioDeviceInfo.TYPE_USB_DEVICE -> "USB_DEVICE"
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB_ACCESSORY"
        AudioDeviceInfo.TYPE_USB_HEADSET -> "USB_HEADSET"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "WIRED_HEADSET"
        AudioDeviceInfo.TYPE_LINE_ANALOG -> "LINE_ANALOG"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "BLUETOOTH_SCO"
        AudioDeviceInfo.TYPE_TELEPHONY -> "TELEPHONY"
        AudioDeviceInfo.TYPE_FM_TUNER -> "FM_TUNER"
        AudioDeviceInfo.TYPE_BUS -> "BUS"
        else -> "TYPE_$type"
      }

  private fun encodingName(encoding: Int): String =
      when (encoding) {
        AudioFormat.ENCODING_PCM_8BIT -> "PCM 8-bit"
        AudioFormat.ENCODING_PCM_16BIT -> "PCM 16-bit"
        AudioFormat.ENCODING_PCM_FLOAT -> "PCM float"
        else -> "ENCODING_$encoding"
      }

  companion object {
    const val NAME = "NativeAudioInput"
  }
}