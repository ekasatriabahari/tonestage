package com.tonestage.app.audio

import android.media.AudioDeviceInfo
import android.media.AudioRecord
import org.json.JSONObject

/**
 * Continuous level measurement from one input device. It reads audio on its own thread and keeps
 * only peak / RMS / clipping numbers. It does NOT record anything to a file. JavaScript polls
 * [snapshot] about 15 times per second.
 */
internal class AudioMeter {
  private val lock = Any()
  @Volatile private var running = false
  @Volatile private var error = ""
  @Volatile private var routedToSelected = false
  private var stats: ChannelStats? = null
  private var thread: Thread? = null

  /** Returns {ok, error, source, sampleRate, channels}. */
  fun start(device: AudioDeviceInfo, sampleRate: Int, channels: Int): JSONObject {
    stop()
    val result = JSONObject()
    val opened = AudioCapture.openRecord(device, sampleRate, channels)
    val rec = opened.record
    if (rec == null) {
      result.put("ok", false)
      result.put("error", opened.error)
      return result
    }
    try {
      rec.startRecording()
    } catch (e: IllegalStateException) {
      rec.release()
      result.put("ok", false)
      result.put("error", "START_FAILED")
      return result
    }
    if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      rec.release()
      result.put("ok", false)
      result.put("error", "START_FAILED")
      return result
    }

    val newStats = ChannelStats(channels)
    synchronized(lock) { stats = newStats }
    error = ""
    routedToSelected = false
    running = true
    val worker = Thread { loop(rec, sampleRate, channels, device.id, newStats) }
    worker.isDaemon = true
    worker.name = "ToneStageMeter"
    thread = worker
    worker.start()

    result.put("ok", true)
    result.put("error", "")
    result.put("source", opened.source)
    result.put("sampleRate", rec.sampleRate)
    result.put("channels", rec.channelCount)
    return result
  }

  fun stop() {
    running = false
    val worker = thread
    thread = null
    if (worker != null) {
      try {
        worker.join(1000)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
  }

  /** Levels since the previous call (peak, RMS) and the clipping total since the meter started. */
  fun snapshot(): JSONObject {
    val json = JSONObject()
    synchronized(lock) {
      json.put("running", running)
      json.put("error", error)
      json.put("routedToSelected", routedToSelected)
      val current = stats
      if (current != null) {
        json.put("frames", current.frames)
        json.put("peaks", current.peaksJson())
        json.put("rms", current.rmsJson())
        json.put("clippedTotal", current.totalClippedJson())
        current.resetWindow()
      }
    }
    return json
  }

  private fun loop(
      rec: AudioRecord,
      sampleRate: Int,
      channels: Int,
      deviceId: Int,
      target: ChannelStats,
  ) {
    val buffer = ShortArray(sampleRate * channels / 20)
    var toSkip = (sampleRate * AudioCapture.SKIP_START_MS / 1000) * channels
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
          lastDataAt = System.nanoTime()
          val skip = minOf(toSkip, usable)
          toSkip -= skip
          val keep = usable - skip
          if (keep > 0) {
            synchronized(lock) { target.add(buffer, skip, keep) }
          }
          routedToSelected = rec.routedDevice?.id == deviceId
        } else {
          if (System.nanoTime() - lastDataAt > 2_000_000_000L) {
            error = "NO_DATA"
            break
          }
          Thread.sleep(5)
        }
      }
    } finally {
      try {
        rec.stop()
      } catch (ignored: IllegalStateException) {}
      rec.release()
      running = false
    }
  }
}