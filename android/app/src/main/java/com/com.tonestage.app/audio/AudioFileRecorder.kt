package com.tonestage.app.audio

import android.media.AudioDeviceInfo
import android.media.AudioRecord
import android.media.AudioTimestamp
import java.io.File
import org.json.JSONObject

/**
 * Records one input device to a 16-bit WAV file and reports WHEN its first frame was captured, on
 * the System.nanoTime() clock (the same clock the video recorder uses). That timestamp is what lets
 * the audio and the video be aligned later. If Android cannot give an exact capture timestamp
 * for this device, an estimate is used and the result says so ("timing": "estimated").
 */
internal class AudioFileRecorder {
  @Volatile private var running = false
  @Volatile private var finalResult: JSONObject? = null
  private var thread: Thread? = null

  /** Returns {ok, error, source, sampleRate, channels}. */
  fun start(device: AudioDeviceInfo, target: File, sampleRate: Int, channels: Int): JSONObject {
    stop()
    val result = JSONObject()
    val opened = AudioCapture.openRecord(device, sampleRate, channels)
    val rec = opened.record
    if (rec == null) {
      result.put("ok", false)
      result.put("error", opened.error)
      return result
    }
    val writer =
        try {
          WavWriter(target, sampleRate, channels)
        } catch (e: Exception) {
          rec.release()
          result.put("ok", false)
          result.put("error", "FILE_ERROR")
          return result
        }
    try {
      rec.startRecording()
    } catch (e: IllegalStateException) {
      rec.release()
      writer.close()
      target.delete()
      result.put("ok", false)
      result.put("error", "START_FAILED")
      return result
    }
    if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      rec.release()
      writer.close()
      target.delete()
      result.put("ok", false)
      result.put("error", "START_FAILED")
      return result
    }

    finalResult = null
    running = true
    val worker =
        Thread {
          capture(rec, writer, target, opened.source, sampleRate, channels, device.id)
        }
    worker.isDaemon = true
    worker.name = "ToneStageAudioRecorder"
    thread = worker
    worker.start()

    result.put("ok", true)
    result.put("error", "")
    result.put("source", opened.source)
    result.put("sampleRate", rec.sampleRate)
    result.put("channels", rec.channelCount)
    return result
  }

  /** Stops recording and returns the measured result. */
  fun stop(): JSONObject {
    running = false
    val worker = thread
    thread = null
    if (worker != null) {
      try {
        worker.join(3000)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    val result = finalResult
    finalResult = null
    if (result != null) {
      return result
    }
    val none = JSONObject()
    none.put("ok", false)
    none.put("error", "NOT_RECORDING")
    return none
  }

  fun isRunning(): Boolean = running

  private fun capture(
      rec: AudioRecord,
      writer: WavWriter,
      target: File,
      sourceName: String,
      sampleRate: Int,
      channels: Int,
      deviceId: Int,
  ) {
    val stats = ChannelStats(channels)
    val buffer = ShortArray(sampleRate * channels / 20)
    val skipFrames = sampleRate * AudioCapture.SKIP_START_MS / 1000
    var toSkip = skipFrames * channels
    var error = ""
    var captureStartNs = 0L // System.nanoTime() of frame 0 of the capture
    var timing = "none"
    var routed = false
    val timestamp = AudioTimestamp()
    // Timestamps polled during the recording, to measure the device's real sample rate against
    // the system clock (a USB device can run slightly fast or slow).
    var haveStamp = false
    var firstStampNs = 0L
    var firstStampFrames = 0L
    var lastStampNs = 0L
    var lastStampFrames = 0L
    var lastPollNs = 0L
    var lastDataAt = System.nanoTime()
    try {
      while (running) {
        val n = rec.read(buffer, 0, buffer.size, AudioRecord.READ_NON_BLOCKING)
        if (n < 0) {
          error = "READ_ERROR_$n"
          break
        }
        val usable = n - (n % channels)
        if (usable > 0) {
          val nowNs = System.nanoTime()
          lastDataAt = nowNs
          if (timing != "timestamp" || nowNs - lastPollNs > 500_000_000L) {
            lastPollNs = nowNs
            val status = rec.getTimestamp(timestamp, AudioTimestamp.TIMEBASE_MONOTONIC)
            if (status == AudioRecord.SUCCESS) {
              if (timing != "timestamp") {
                captureStartNs =
                    timestamp.nanoTime - timestamp.framePosition * 1_000_000_000L / sampleRate
                timing = "timestamp"
              }
              if (!haveStamp) {
                firstStampNs = timestamp.nanoTime
                firstStampFrames = timestamp.framePosition
                haveStamp = true
              }
              lastStampNs = timestamp.nanoTime
              lastStampFrames = timestamp.framePosition
            } else if (timing == "none") {
              // Estimate: the first read returned right after capturing its frames.
              captureStartNs = nowNs - (usable / channels) * 1_000_000_000L / sampleRate
              timing = "estimated"
            }
          }
          val skip = minOf(toSkip, usable)
          toSkip -= skip
          val keep = usable - skip
          if (keep > 0) {
            stats.add(buffer, skip, keep)
            writer.write(buffer, skip, keep)
          }
          routed = rec.routedDevice?.id == deviceId
        } else {
          if (System.nanoTime() - lastDataAt > 2_000_000_000L) {
            error = "NO_DATA"
            break
          }
          Thread.sleep(5)
        }
      }
    } catch (e: Exception) {
      if (error.isEmpty()) {
        error = "CAPTURE_FAILED"
      }
    } finally {
      try {
        rec.stop()
      } catch (ignored: IllegalStateException) {}
      rec.release()
      try {
        writer.close()
      } catch (ignored: Exception) {}
      running = false
    }

    val ok = error.isEmpty() && stats.frames > 0 && timing != "none"
    if (!ok) {
      target.delete()
    }
    val json = JSONObject()
    json.put("ok", ok)
    json.put("error", if (ok) "" else error.ifEmpty { "NO_DATA" })
    json.put("path", if (ok) target.absolutePath else "")
    json.put("source", sourceName)
    json.put("sampleRate", sampleRate)
    json.put("channels", channels)
    json.put("frames", stats.frames)
    json.put("peaks", stats.peaksJson())
    json.put("rms", stats.rmsJson())
    json.put("clippedTotal", stats.totalClippedJson())
    json.put("routedToSelected", routed)
    json.put("timing", timing)
    // Real sample rate measured against the system clock; 0 when there was not enough data (< 2 s).
    var measuredRateHz = 0.0
    var rateSpanMs = 0L
    if (haveStamp) {
      val spanNs = lastStampNs - firstStampNs
      val spanFrames = lastStampFrames - firstStampFrames
      if (spanNs >= 2_000_000_000L && spanFrames > 0) {
        measuredRateHz = spanFrames * 1_000_000_000.0 / spanNs
        rateSpanMs = spanNs / 1_000_000L
      }
    }
    json.put("measuredRateHz", measuredRateHz)
    json.put("rateSpanMs", rateSpanMs)
    // Capture time of the first frame stored in the file (the skipped start-up part is excluded).
    json.put("startUs", (captureStartNs + skipFrames * 1_000_000_000L / sampleRate) / 1000)
    finalResult = json
  }
}