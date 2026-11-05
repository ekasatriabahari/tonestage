package com.tonestage.app.session

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.StatFs
import java.io.File
import java.io.FileOutputStream
import org.json.JSONArray
import org.json.JSONObject

/**
 * Recording sessions live in the app's private files folder (not the cache, which Android may
 * clear), one folder per session:
 *   video.mp4   the camera video, copied as received
 *   guitar.wav  the clean guitar recording, exactly as captured
 *   session.json  what was measured (start times, backing-track runs, mixer settings)
 *   export_*.mp4  finished exports
 * The raw files are kept until you delete them.
 */
internal class SessionStore(private val context: Context) {

  val root: File
    get() = File(context.filesDir, "sessions").also { it.mkdirs() }

  private fun validId(id: String) = id.isNotEmpty() && id.all { it.isLetterOrDigit() || it == '_' || it == '-' }

  fun dir(id: String): File? {
    if (!validId(id)) {
      return null
    }
    val folder = File(root, id)
    return if (folder.isDirectory) folder else null
  }

  /** True when [path] is a file inside the sessions folder. */
  fun owns(path: String): Boolean {
    return try {
      File(path).canonicalPath.startsWith(root.canonicalPath + File.separator)
    } catch (e: Exception) {
      false
    }
  }

  fun create(): JSONObject {
    val now = System.currentTimeMillis()
    val id = "s_$now"
    val folder = File(root, id)
    val json = JSONObject()
    if (!folder.mkdirs()) {
      json.put("ok", false)
      json.put("error", "CANNOT_CREATE")
      return json
    }
    json.put("ok", true)
    json.put("error", "")
    json.put("id", id)
    json.put("createdMs", now)
    val video = File(folder, "video.mp4")
    val guitar = File(folder, "guitar.wav")
    json.put("videoPath", video.absolutePath)
    json.put("audioPath", guitar.absolutePath)
    val draft = JSONObject()
        .put("version", 2)
        .put("id", id)
        .put("createdMs", now)
        .put("status", "recording")
        .put("title", "Guitar Cover")
        .put("video", JSONObject().put("path", video.absolutePath))
        .put("guitar", JSONObject().put("path", guitar.absolutePath))
        .put("exports", JSONArray())
    if (!saveManifest(id, draft.toString())) {
      folder.deleteRecursively()
      json.put("ok", false)
      json.put("error", "CANNOT_WRITE_MANIFEST")
      return json
    }
    return json
  }

  fun saveManifest(id: String, json: String): Boolean {
    val folder = dir(id) ?: return false
    val target = File(folder, "session.json")
    val temporary = File(folder, "session.json.tmp")
    temporary.writeText(json)
    if (target.exists() && !target.delete()) {
      temporary.delete()
      return false
    }
    if (!temporary.renameTo(target)) {
      temporary.delete()
      return false
    }
    return true
  }

  fun readManifest(id: String): JSONObject? {
    val folder = dir(id) ?: return null
    val file = File(folder, "session.json")
    if (!file.exists()) {
      return null
    }
    return try {
      JSONObject(file.readText())
    } catch (e: Exception) {
      null
    }
  }

  fun list(): JSONArray {
    val result = JSONArray()
    val folders = root.listFiles { f -> f.isDirectory } ?: return result
    for (folder in folders.sortedByDescending { it.name }) {
      val json = JSONObject()
      json.put("id", folder.name)
      json.put("createdMs", folder.name.removePrefix("s_").toLongOrNull() ?: folder.lastModified())
      val manifest = readManifest(folder.name)
      val thumbnail = File(folder, "thumbnail.jpg")
      if (!thumbnail.exists() && File(folder, "video.mp4").exists()) createThumbnail(folder.name)
      json.put("manifest", manifest ?: JSONObject.NULL)
      val savedStatus = manifest?.optString("status", "ready") ?: "recovery_required"
      json.put("status", savedStatus)
      json.put("thumbnailPath", if (thumbnail.exists()) thumbnail.absolutePath else "")
      json.put("videoBytes", File(folder, "video.mp4").let { if (it.exists()) it.length() else 0L })
      json.put("guitarBytes", File(folder, "guitar.wav").let { if (it.exists()) it.length() else 0L })
      val exports = JSONArray()
      folder.listFiles { f -> f.name.startsWith("export_") && f.name.endsWith(".mp4") }
          ?.sortedByDescending { it.name }
          ?.forEach {
            val e = JSONObject()
            e.put("path", it.absolutePath)
            e.put("name", it.name)
            e.put("bytes", it.length())
            exports.put(e)
          }
      json.put("exports", exports)
      result.put(json)
    }
    return result
  }

  /** Marks drafts from a previous app process as interrupted without deleting their raw data. */
  fun markInterruptedSessions() {
    val folders = root.listFiles { f -> f.isDirectory } ?: return
    for (folder in folders) {
      val manifest = readManifest(folder.name) ?: continue
      if (manifest.optString("status") == "recording") {
        manifest.put("status", "interrupted")
        saveManifest(folder.name, manifest.toString())
      }
    }
  }

  fun delete(id: String): Boolean {
    val folder = dir(id) ?: return false
    return folder.deleteRecursively()
  }

  /** Deletes the raw video and guitar files (and records that), keeping the exports. */
  fun deleteRaw(id: String): Boolean {
    val folder = dir(id) ?: return false
    File(folder, "video.mp4").delete()
    File(folder, "guitar.wav").delete()
    folder.listFiles { file -> file.name.startsWith("backing_source.") }?.forEach { it.delete() }
    File(folder, "thumbnail.jpg").delete()
    val manifest = readManifest(id)
    if (manifest != null) {
      manifest.put("rawDeleted", true)
      saveManifest(id, manifest.toString())
    }
    return true
  }

  /** Copies a user-selected content URI into the project for reliable re-export. */
  fun copyBackingTrack(id: String, source: Uri, displayName: String): String? {
    val folder = dir(id) ?: return null
    val rawExtension = displayName.substringAfterLast('.', "").lowercase()
    val extension = if (rawExtension.matches(Regex("[a-z0-9]{2,5}"))) rawExtension
      else when (context.contentResolver.getType(source)) {
        "audio/mpeg" -> "mp3"
        "audio/wav", "audio/x-wav" -> "wav"
        "audio/mp4", "audio/m4a" -> "m4a"
        "audio/aac" -> "aac"
        "audio/ogg" -> "ogg"
        "audio/flac" -> "flac"
        else -> "audio"
      }
    val target = File(folder, "backing_source.$extension")
    return try {
      val input = context.contentResolver.openInputStream(source) ?: return null
      input.use { stream -> FileOutputStream(target).use { output -> stream.copyTo(output) } }
      if (target.length() <= 0L) {
        target.delete()
        null
      } else Uri.fromFile(target).toString()
    } catch (e: Exception) {
      target.delete()
      null
    }
  }

  /** Extracts one representative frame without modifying the raw video. */
  fun createThumbnail(id: String): String? {
    val folder = dir(id) ?: return null
    val video = File(folder, "video.mp4")
    if (!video.exists() || video.length() <= 0L) return null
    val target = File(folder, "thumbnail.jpg")
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(video.absolutePath)
      val frame = retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: return null
      FileOutputStream(target).use { output ->
        if (!frame.compress(Bitmap.CompressFormat.JPEG, 88, output)) {
          target.delete()
          return null
        }
      }
      target.absolutePath
    } catch (e: Exception) {
      target.delete()
      null
    } finally {
      retriever.release()
    }
  }

  fun storage(): JSONObject {
    val stat = StatFs(context.filesDir.absolutePath)
    val json = JSONObject()
    json.put("availableBytes", stat.availableBytes)
    json.put("totalBytes", stat.totalBytes)
    return json
  }
}