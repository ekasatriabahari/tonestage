package com.tonestage.app.session

import android.content.Context
import android.net.Uri
import android.os.StatFs
import com.tonestage.app.audio.AvMerger
import com.tonestage.app.audio.WavWriter
import com.tonestage.app.backing.BiquadEq
import com.tonestage.app.backing.EqBandSettings
import com.tonestage.app.backing.EqSettings
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.log10
import org.json.JSONArray
import org.json.JSONObject

internal class ExportProgress {
  @Volatile var stage = "idle"
  @Volatile var percent = 0
  @Volatile var cancelled = false
}

private class BackingRun(val startNanoUs: Long, val startFileUs: Long, val endNanoUs: Long)

/**
 * Builds the final MP4 from a recorded session:
 *   1. The backing track is decoded again from its original file, for exactly the stretches that
 *      were playing during the recording (from the logged runs), then converted to the guitar's
 *      sample rate, equalized, and given the volume you used.
 *   2. The clean guitar recording is added with its mixer volume or mute. If the sum would exceed
 *      full scale, ONE constant gain reduction is applied (no limiter, no pumping) and reported.
 *   3. The video samples are copied unchanged and the mix is encoded to AAC (AvMerger).
 * Every input file is left untouched, so an export can be repeated with other offsets.
 */
internal object SessionExporter {

  private const val BLOCK = 4096
  private const val HEADROOM = 0.98f

  fun export(
      context: Context,
      sessionDir: File,
      manifest: JSONObject,
      options: JSONObject,
      progress: ExportProgress,
  ): JSONObject {
    val temporary = ArrayList<File>()
    try {
      return run(context, sessionDir, manifest, options, progress, temporary)
    } catch (e: Exception) {
      return failure(if (progress.cancelled) "CANCELLED" else "EXPORT_FAILED")
    } finally {
      for (file in temporary) {
        file.delete()
      }
    }
  }

  private fun run(
      context: Context,
      sessionDir: File,
      manifest: JSONObject,
      options: JSONObject,
      progress: ExportProgress,
      temporary: ArrayList<File>,
  ): JSONObject {
    progress.stage = "prepare"
    progress.percent = 0

    val video = manifest.optJSONObject("video") ?: return failure("NO_VIDEO")
    val videoPath = video.optString("path")
    if (videoPath.isEmpty() || !File(videoPath).exists()) {
      return failure("RAW_MISSING")
    }
    val offsets = manifest.optJSONObject("offsets")
    val latencyMs = options.optLong("videoLatencyMs", offsets?.optLong("videoLatencyMs", 0L) ?: 0L)
    val backingOffsetUs = options.optLong("backingOffsetMs", offsets?.optLong("backingOffsetMs", 0L) ?: 0L) * 1000L
    val includeBacking = options.optBoolean("includeBacking", true)

    val videoFirstSampleUs = video.optLong("firstSampleUs", 0L)
    val videoFirstUs = videoFirstSampleUs - latencyMs * 1000L
    val videoEndUs = videoFirstUs + video.optLong("mediaDurationMs", 0L) * 1000L

    // ---- guitar -----------------------------------------------------------------------------
    val guitar = manifest.optJSONObject("guitar")
    val guitarPath = guitar?.optString("path") ?: ""
    val hasGuitar = guitar != null && guitarPath.isNotEmpty() && File(guitarPath).exists()
    val rate = if (hasGuitar && guitar != null) guitar.optInt("sampleRate", 44100) else 44100
    val guitarChannels = if (hasGuitar && guitar != null) guitar.optInt("channels", 2).coerceIn(1, 2) else 2
    val guitarStartUs = if (hasGuitar && guitar != null) guitar.optLong("startUs", 0L) else Long.MAX_VALUE
    val guitarFrames =
        if (hasGuitar) maxOf(0L, (File(guitarPath).length() - 44) / (guitarChannels * 2)) else 0L
    val guitarEndUs = if (hasGuitar) guitarStartUs + guitarFrames * 1_000_000L / rate else Long.MIN_VALUE
    val mix = manifest.optJSONObject("mix")
    val guitarGain =
        if (mix != null && mix.optBoolean("guitarMuted", false)) 0f
        else (mix?.optDouble("guitarVolume", 1.0) ?: 1.0).toFloat().coerceIn(0f, 1f)

    // ---- backing track ------------------------------------------------------------------------
    val backing = manifest.optJSONObject("backing")
    val runs = parseRuns(backing?.optJSONArray("runs"))
    val backingUri = backing?.optString("uri") ?: ""
    val hasBacking = includeBacking && backing != null && backingUri.isNotEmpty() && runs.isNotEmpty()
    if (!hasGuitar && !hasBacking) {
      return failure("NO_AUDIO")
    }

    val t0 = minOf(videoFirstUs, guitarStartUs)
    val tEnd = maxOf(videoEndUs, guitarEndUs)
    val totalFrames = (tEnd - t0) * rate / 1_000_000L
    if (totalFrames <= 0) {
      return failure("EMPTY")
    }

    // ---- is there enough room? ------------------------------------------------------------------
    val needed =
        (if (hasBacking) totalFrames * 8 else 0L) + totalFrames * 4 + File(videoPath).length() +
            totalFrames / rate * 24_000L
    if (StatFs(sessionDir.absolutePath).availableBytes < needed + needed / 5) {
      return failure("STORAGE_LOW")
    }

    // ---- 1. backing track ------------------------------------------------------------------------
    var backingFile: File? = null
    if (hasBacking && backing != null) {
      progress.stage = "backing"
      val mixer = backing.optJSONObject("mixer")
      val volume = mixer?.optDouble("backingVolume", 0.8) ?: 0.8
      val master = mixer?.optDouble("masterVolume", 1.0) ?: 1.0
      val muted = mixer?.optBoolean("backingMuted", false) ?: false
      val gain = if (muted) 0f else (volume * master).toFloat().coerceIn(0f, 1f)
      val file = File(sessionDir, "tmp_backing.f32")
      temporary.add(file)
      val ok =
          renderBacking(
              context,
              Uri.parse(backingUri),
              runs,
              backingOffsetUs,
              t0,
              tEnd,
              rate,
              totalFrames,
              gain,
              parseEq(mixer?.optJSONObject("eq")),
              file,
              progress,
          )
      if (!ok) {
        return failure("CANCELLED")
      }
      backingFile = file
    }

    // ---- 2. mix ------------------------------------------------------------------------------------
    progress.stage = "mix"
    progress.percent = 45
    val mixFile = File(sessionDir, "tmp_mix.wav")
    temporary.add(mixFile)
    val gStartFrame = if (hasGuitar) (guitarStartUs - t0) * rate / 1_000_000L else 0L
    val mixResult =
        mixDown(
            if (hasGuitar) guitarPath else null,
            guitarChannels,
            guitarFrames,
            gStartFrame,
            guitarGain,
            backingFile,
            totalFrames,
            rate,
            mixFile,
            progress,
        ) ?: return failure("CANCELLED")

    // ---- 3. encode and write the MP4 ---------------------------------------------------------------
    progress.stage = "encode"
    progress.percent = 75
    val output = File(sessionDir, "export_${System.currentTimeMillis()}.mp4")
    val merged = AvMerger.merge(videoPath, mixFile.absolutePath, output, videoFirstSampleUs, t0, latencyMs)
    if (!merged.optBoolean("ok", false)) {
      output.delete()
      return failure(merged.optString("error", "MERGE_FAILED"))
    }
    progress.percent = 100

    val result = JSONObject()
    result.put("ok", true)
    result.put("error", "")
    result.put("path", output.absolutePath)
    result.put("name", output.name)
    result.put("bytes", output.length())
    result.put("durationMs", merged.optLong("durationMs", 0L))
    result.put("peakDb", if (mixResult.peak > 0f) 20.0 * log10(mixResult.peak.toDouble()) else -200.0)
    result.put("gainReductionDb", if (mixResult.reduction < 1f) -20.0 * log10(1.0 / mixResult.reduction) else 0.0)
    result.put("includedGuitar", hasGuitar)
    result.put("includedBacking", hasBacking)
    result.put("backingRuns", runs.size)
    result.put("videoLatencyMs", latencyMs)
    result.put("backingOffsetMs", backingOffsetUs / 1000L)
    result.put("createdMs", System.currentTimeMillis())
    return result
  }

  // ------------------------------------------------------------------------------------------------

  private fun renderBacking(
      context: Context,
      uri: Uri,
      runs: List<BackingRun>,
      offsetUs: Long,
      t0: Long,
      tEnd: Long,
      rate: Int,
      totalFrames: Long,
      gain: Float,
      eq: EqSettings,
      outFile: File,
      progress: ExportProgress,
  ): Boolean {
    BufferedOutputStream(FileOutputStream(outFile), 1 shl 16).use { stream ->
      var written = 0L
      val zeros = ByteArray(BLOCK * 8)

      fun pad(upTo: Long) {
        var remaining = upTo - written
        while (remaining > 0) {
          val n = minOf(remaining, BLOCK.toLong()).toInt()
          stream.write(zeros, 0, n * 8)
          written += n
          remaining -= n
        }
      }

      fun writeFrames(samples: FloatArray, frames: Int) {
        val bytes = ByteBuffer.allocate(frames * 8).order(ByteOrder.LITTLE_ENDIAN)
        bytes.asFloatBuffer().put(samples, 0, frames * 2)
        stream.write(bytes.array())
        written += frames
      }

      val ordered = runs.sortedBy { it.startNanoUs }
      for ((index, run) in ordered.withIndex()) {
        if (progress.cancelled) {
          return false
        }
        progress.percent = 45 * index / maxOf(1, ordered.size)
        val a = run.startNanoUs + offsetUs
        val b = run.endNanoUs + offsetUs
        val a2 = maxOf(a, t0)
        val b2 = minOf(b, tEnd)
        if (b2 <= a2) {
          continue
        }
        var fileStart = run.startFileUs + (a2 - a)
        val outStart = (a2 - t0) * rate / 1_000_000L
        var runFrames = (b2 - a2) * rate / 1_000_000L
        if (outStart < written) {
          val overlap = written - outStart
          if (overlap >= runFrames) {
            continue
          }
          runFrames -= overlap
          fileStart += overlap * 1_000_000L / rate
        }
        pad(maxOf(outStart, written))
        var remaining = runFrames
        if (fileStart < 0) {
          // The log reaches back to before the track really started: silence until position 0.
          val silence = minOf(remaining, (-fileStart * rate + 999_999L) / 1_000_000L)
          pad(written + silence)
          remaining -= silence
          fileStart = 0
        }
        if (remaining <= 0) {
          continue
        }

        val decoder = PcmDecoder(context, uri)
        try {
          decoder.open(fileStart)
          val resampler = Resampler(decoder.sampleRate, rate)
          val filter = BiquadEq(rate, 2)
          filter.configure(eq)
          var finished = false
          while (remaining > 0 && !finished) {
            if (progress.cancelled) {
              return false
            }
            val chunk = decoder.read()
            val data: FloatArray
            if (chunk == null) {
              data = resampler.flush()
              finished = true
            } else {
              data = resampler.process(chunk.samples, chunk.frames)
            }
            val frames = data.size / 2
            if (frames == 0) {
              continue
            }
            filter.process(data, frames * 2)
            for (i in 0 until frames * 2) {
              data[i] = data[i] * gain
            }
            val take = minOf(remaining, frames.toLong()).toInt()
            writeFrames(data, take)
            remaining -= take
          }
          if (remaining > 0) {
            pad(written + remaining) // the file ended before the run did
          }
        } finally {
          decoder.close()
        }
      }
      pad(totalFrames)
    }
    return true
  }

  private class MixResult(val peak: Float, val reduction: Float)

  private fun mixDown(
      guitarPath: String?,
      guitarChannels: Int,
      guitarFrames: Long,
      gStartFrame: Long,
      guitarGain: Float,
      backingFile: File?,
      totalFrames: Long,
      rate: Int,
      outFile: File,
      progress: ExportProgress,
  ): MixResult? {
    val guitarFrameBytes = guitarChannels * 2
    val mix = FloatArray(BLOCK * 2)
    val guitarBytes = ByteArray(BLOCK * guitarFrameBytes)
    val backingBytes = ByteArray(BLOCK * 8)
    val backingFloats = FloatArray(BLOCK * 2)

    // Visits the summed signal block by block. Returns false when cancelled.
    fun visit(action: (FloatArray, Int) -> Unit): Boolean {
      val guitar = if (guitarPath != null) RandomAccessFile(guitarPath, "r") else null
      val backing =
          if (backingFile != null) DataInputStream(BufferedInputStream(FileInputStream(backingFile), 1 shl 16)) else null
      try {
        var start = 0L
        while (start < totalFrames) {
          if (progress.cancelled) {
            return false
          }
          val n = minOf(BLOCK.toLong(), totalFrames - start).toInt()
          java.util.Arrays.fill(mix, 0, n * 2, 0f)
          if (guitar != null) {
            val g0 = start - gStartFrame
            val from = maxOf(g0, 0L)
            val to = minOf(g0 + n, guitarFrames)
            if (to > from) {
              val count = (to - from).toInt()
              guitar.seek(44 + from * guitarFrameBytes)
              guitar.readFully(guitarBytes, 0, count * guitarFrameBytes)
              val offset = (from - g0).toInt()
              for (i in 0 until count) {
                val p = i * guitarFrameBytes
                val left = ((guitarBytes[p].toInt() and 0xFF) or (guitarBytes[p + 1].toInt() shl 8)).toShort() / 32768f
                val right =
                    if (guitarChannels == 2) {
                      ((guitarBytes[p + 2].toInt() and 0xFF) or (guitarBytes[p + 3].toInt() shl 8)).toShort() / 32768f
                    } else {
                      left
                    }
                mix[(offset + i) * 2] += left * guitarGain
                mix[(offset + i) * 2 + 1] += right * guitarGain
              }
            }
          }
          if (backing != null) {
            backing.readFully(backingBytes, 0, n * 8)
            ByteBuffer.wrap(backingBytes, 0, n * 8).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(backingFloats, 0, n * 2)
            for (i in 0 until n * 2) {
              mix[i] += backingFloats[i]
            }
          }
          action(mix, n)
          start += n
        }
      } finally {
        guitar?.close()
        backing?.close()
      }
      return true
    }

    // Pass 1: find the peak of the sum.
    var peak = 0f
    if (!visit { block, n ->
          for (i in 0 until n * 2) {
            val v = abs(block[i])
            if (v > peak) {
              peak = v
            }
          }
        }) {
      return null
    }
    val reduction = if (peak > HEADROOM) HEADROOM / peak else 1f

    // Pass 2: write the mix, with the one constant gain reduction if it was needed.
    val writer = WavWriter(outFile, rate, 2)
    val shorts = ShortArray(BLOCK * 2)
    val completed =
        try {
          visit { block, n ->
            for (i in 0 until n * 2) {
              shorts[i] = Math.round(block[i] * reduction * 32767f).coerceIn(-32768, 32767).toShort()
            }
            writer.write(shorts, 0, n * 2)
          }
        } finally {
          writer.close()
        }
    return if (completed) MixResult(peak, reduction) else null
  }

  // ------------------------------------------------------------------------------------------------

  private fun parseRuns(array: JSONArray?): List<BackingRun> {
    val list = ArrayList<BackingRun>()
    if (array == null) {
      return list
    }
    for (i in 0 until array.length()) {
      val item = array.optJSONObject(i) ?: continue
      val start = item.optLong("startNanoUs", 0L)
      val end = item.optLong("endNanoUs", -1L)
      if (end > start) {
        list.add(BackingRun(start, item.optLong("startFileUs", 0L), end))
      }
    }
    return list
  }

  private fun parseEq(obj: JSONObject?): EqSettings {
    if (obj == null) {
      return EqSettings(false, emptyList())
    }
    val bands = ArrayList<EqBandSettings>()
    val array = obj.optJSONArray("bands") ?: JSONArray()
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
    return EqSettings(obj.optBoolean("enabled", false), bands)
  }

  private fun failure(code: String): JSONObject {
    val json = JSONObject()
    json.put("ok", false)
    json.put("error", code)
    json.put("path", "")
    return json
  }
}