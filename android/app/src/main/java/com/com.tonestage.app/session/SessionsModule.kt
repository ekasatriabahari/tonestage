package com.tonestage.app.session

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.tonestage.app.yi.NativeSessionsSpec
import java.io.File
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Implements NativeSessionsSpec (see specs/NativeSessions.ts). The generated spec classes all live
 * in the package set by codegenConfig (com.tonestage.app.yi), hence the import above.
 */
class SessionsModule(reactContext: ReactApplicationContext) : NativeSessionsSpec(reactContext) {

  private val appContext: Context = reactContext.applicationContext
  private val store = SessionStore(appContext)
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val exportExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private val progress = ExportProgress()
  @Volatile private var exporting = false

  override fun getName() = NAME

  override fun createSession(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(store.create().toString())
      } catch (e: Exception) {
        promise.reject("SESSION_ERROR", e.message ?: "Could not create the session")
      }
    }
  }

  override fun saveManifest(id: String, json: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(store.saveManifest(id, json))
      } catch (e: Exception) {
        promise.reject("SESSION_ERROR", e.message ?: "Could not save the manifest")
      }
    }
  }

  override fun listSessions(promise: Promise) {
    executor.execute {
      try {
        promise.resolve(store.list().toString())
      } catch (e: Exception) {
        promise.reject("SESSION_ERROR", e.message ?: "Could not list the sessions")
      }
    }
  }

  override fun deleteSession(id: String, promise: Promise) {
    executor.execute { promise.resolve(store.delete(id)) }
  }

  override fun deleteRaw(id: String, promise: Promise) {
    executor.execute { promise.resolve(store.deleteRaw(id)) }
  }

  override fun storageInfo(promise: Promise) {
    try {
      promise.resolve(store.storage().toString())
    } catch (e: Exception) {
      promise.reject("SESSION_ERROR", e.message ?: "Could not read the storage")
    }
  }

  // ---- export -------------------------------------------------------------------------------------

  override fun exportSession(id: String, optionsJson: String, promise: Promise) {
    if (exporting) {
      promise.reject("BUSY", "An export is already running")
      return
    }
    exporting = true
    progress.stage = "prepare"
    progress.percent = 0
    progress.cancelled = false
    exportExecutor.execute {
      try {
        val folder = store.dir(id)
        val manifest = store.readManifest(id)
        if (folder == null || manifest == null) {
          promise.resolve(JSONObject().put("ok", false).put("error", "SESSION_NOT_FOUND").toString())
          return@execute
        }
        val result = SessionExporter.export(appContext, folder, manifest, JSONObject(optionsJson), progress)
        if (result.optBoolean("ok", false)) {
          // Remember the export (and the settings it used) in the manifest.
          val list = manifest.optJSONArray("exports") ?: JSONArray()
          list.put(
              JSONObject()
                  .put("path", result.optString("path"))
                  .put("createdMs", result.optLong("createdMs"))
                  .put("videoLatencyMs", result.optLong("videoLatencyMs"))
                  .put("backingOffsetMs", result.optLong("backingOffsetMs"))
                  .put("gainReductionDb", result.optDouble("gainReductionDb", 0.0))
          )
          manifest.put("exports", list)
          store.saveManifest(id, manifest.toString())
        }
        promise.resolve(result.toString())
      } catch (e: Exception) {
        promise.resolve(JSONObject().put("ok", false).put("error", "EXPORT_FAILED").toString())
      } finally {
        exporting = false
        progress.stage = "idle"
      }
    }
  }

  override fun getExportProgress(promise: Promise) {
    val json = JSONObject()
    json.put("stage", progress.stage)
    json.put("percent", progress.percent)
    json.put("exporting", exporting)
    promise.resolve(json.toString())
  }

  override fun cancelExport(promise: Promise) {
    progress.cancelled = true
    promise.resolve(null)
  }

  override fun saveToDownloads(path: String, promise: Promise) {
    executor.execute {
      try {
        if (Build.VERSION.SDK_INT < 29) {
          promise.reject("UNSUPPORTED", "Needs Android 10 or newer")
          return@execute
        }
        val source = File(path)
        if (!store.owns(path) || !source.exists()) {
          promise.reject("FILE_NOT_FOUND", "File not found")
          return@execute
        }
        val resolver = appContext.contentResolver
        val values = ContentValues()
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, source.name)
        values.put(MediaStore.MediaColumns.MIME_TYPE, if (source.name.endsWith(".wav")) "audio/wav" else "video/mp4")
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ToneStage")
        val uri =
            resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Could not create the file in Downloads")
        val output = resolver.openOutputStream(uri) ?: throw IOException("Could not open the file")
        output.use { out -> source.inputStream().use { input -> input.copyTo(out) } }
        promise.resolve("Download/ToneStage/${source.name}")
      } catch (e: Exception) {
        promise.reject("SESSION_ERROR", e.message ?: "Could not save the file")
      }
    }
  }

  override fun invalidate() {
    progress.cancelled = true
    executor.shutdownNow()
    exportExecutor.shutdownNow()
    super.invalidate()
  }

  companion object {
    const val NAME = "NativeSessions"
  }
}