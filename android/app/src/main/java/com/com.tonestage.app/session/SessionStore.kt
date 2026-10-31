package com.tonestage.app.session

import android.content.Context
import android.os.StatFs
import java.io.File
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
    json.put("videoPath", File(folder, "video.mp4").absolutePath)
    json.put("audioPath", File(folder, "guitar.wav").absolutePath)
    return json
  }

  fun saveManifest(id: String, json: String): Boolean {
    val folder = dir(id) ?: return false
    File(folder, "session.json").writeText(json)
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
      json.put("manifest", manifest ?: JSONObject.NULL)
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

  fun delete(id: String): Boolean {
    val folder = dir(id) ?: return false
    return folder.deleteRecursively()
  }

  /** Deletes the raw video and guitar files (and records that), keeping the exports. */
  fun deleteRaw(id: String): Boolean {
    val folder = dir(id) ?: return false
    File(folder, "video.mp4").delete()
    File(folder, "guitar.wav").delete()
    val manifest = readManifest(id)
    if (manifest != null) {
      manifest.put("rawDeleted", true)
      saveManifest(id, manifest.toString())
    }
    return true
  }

  fun storage(): JSONObject {
    val stat = StatFs(context.filesDir.absolutePath)
    val json = JSONObject()
    json.put("availableBytes", stat.availableBytes)
    json.put("totalBytes", stat.totalBytes)
    return json
  }
}