package com.tonestage.app.yi

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import androidx.media3.common.Format
import java.io.File
import java.nio.ByteBuffer
import org.json.JSONObject

/**
 * Writes the camera's H.264 video, exactly as received (no decoding or re-encoding), into an MP4.
 * It is fed from the ExoPlayer video renderer ([TappingVideoRenderer]); the picture shown on
 * screen is not affected. Recording begins at the first keyframe. There is no audio here.
 *
 * Every number reported by [stop] is measured, not assumed: frames, keyframes, bytes, the media
 * duration (from the stream's timestamps) and the wall-clock time, so the two can be compared.
 */
internal class StreamRecorder {

  private enum class State {
    IDLE,
    WAITING_KEYFRAME,
    RUNNING,
    FAILED,
  }

  private var state = State.IDLE
  private var file: File? = null
  private var muxer: MediaMuxer? = null
  private var trackIndex = -1
  private val info = MediaCodec.BufferInfo()

  // From the stream's Format (always kept, even while not recording).
  private var width = 0
  private var height = 0
  private var formatSps: ByteArray? = null
  private var formatPps: ByteArray? = null

  // Seen inside the stream itself.
  private var streamSps: ByteArray? = null
  private var streamPps: ByteArray? = null

  private var error = ""
  private var startedWallMs = 0L
  private var firstSampleWallMs = 0L
  private var firstTimeUs = 0L
  private var lastPtsUs = 0L
  private var frames = 0
  private var keyFrames = 0
  private var bytes = 0L
  private var nonMonotonic = 0
  private var droppedBeforeStart = 0
  private var csdFromFormat = false

  /** Called (on the playback thread) when the first video sample has been written. */
  @Volatile var onStarted: (() -> Unit)? = null

  @Synchronized
  fun onFormat(format: Format) {
    if (format.width > 0 && format.height > 0) {
      width = format.width
      height = format.height
    }
    for (entry in format.initializationData) {
      H264Util.forEachNal(entry) { type, start, end ->
        if (type == H264Util.NAL_SPS) {
          formatSps = H264Util.withStartCode(entry, start, end)
        } else if (type == H264Util.NAL_PPS) {
          formatPps = H264Util.withStartCode(entry, start, end)
        }
      }
    }
  }

  @Synchronized
  fun start(target: File) {
    if (state != State.IDLE) {
      return
    }
    file = target
    error = ""
    startedWallMs = System.currentTimeMillis()
    firstSampleWallMs = 0L
    lastPtsUs = 0L
    frames = 0
    keyFrames = 0
    bytes = 0L
    nonMonotonic = 0
    droppedBeforeStart = 0
    csdFromFormat = false
    state = State.WAITING_KEYFRAME
  }

  /** [data] is read without changing it. [timeUs] is the sample time from the stream. */
  @Synchronized
  fun onSample(data: ByteBuffer, timeUs: Long, flaggedKeyFrame: Boolean) {
    if (state != State.WAITING_KEYFRAME && state != State.RUNNING) {
      return
    }
    val view = data.duplicate()
    view.position(0)
    val size = view.limit()
    if (size <= 0) {
      return
    }
    val raw = ByteArray(size)
    view.get(raw)

    val annexB: ByteArray
    if (H264Util.isAnnexB(raw)) {
      annexB = raw
    } else {
      val converted = H264Util.avccToAnnexB(raw)
      if (converted == null) {
        fail("UNSUPPORTED_SAMPLE_FORMAT")
        return
      }
      annexB = converted
    }

    var hasIdr = false
    H264Util.forEachNal(annexB) { type, start, end ->
      when (type) {
        H264Util.NAL_IDR -> hasIdr = true
        H264Util.NAL_SPS -> streamSps = H264Util.withStartCode(annexB, start, end)
        H264Util.NAL_PPS -> streamPps = H264Util.withStartCode(annexB, start, end)
      }
    }
    val isKey = flaggedKeyFrame || hasIdr

    if (state == State.WAITING_KEYFRAME) {
      if (!isKey) {
        droppedBeforeStart++
        return
      }
      val sps = streamSps ?: formatSps
      val pps = streamPps ?: formatPps
      if (sps == null || pps == null) {
        droppedBeforeStart++
        return
      }
      if (width <= 0 || height <= 0) {
        fail("NO_FORMAT")
        return
      }
      val target = file
      if (target == null) {
        fail("NO_FILE")
        return
      }
      try {
        val mediaFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height)
        mediaFormat.setByteBuffer("csd-0", ByteBuffer.wrap(sps))
        mediaFormat.setByteBuffer("csd-1", ByteBuffer.wrap(pps))
        val newMuxer = MediaMuxer(target.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        trackIndex = newMuxer.addTrack(mediaFormat)
        newMuxer.start()
        muxer = newMuxer
      } catch (e: Exception) {
        fail("MUXER_START_FAILED")
        return
      }
      csdFromFormat = streamSps == null || streamPps == null
      firstTimeUs = timeUs
      firstSampleWallMs = System.currentTimeMillis()
      state = State.RUNNING
      onStarted?.invoke()
    }

    var ptsUs = timeUs - firstTimeUs
    if (ptsUs < lastPtsUs) {
      nonMonotonic++
      ptsUs = lastPtsUs
    }
    try {
      info.set(0, annexB.size, ptsUs, if (isKey) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
      muxer?.writeSampleData(trackIndex, ByteBuffer.wrap(annexB), info)
    } catch (e: Exception) {
      fail("MUXER_WRITE_FAILED")
      return
    }
    lastPtsUs = ptsUs
    frames++
    bytes += annexB.size
    if (isKey) {
      keyFrames++
    }
  }

  /** Finishes the file. Returns the measured result, or null if no recording was started. */
  @Synchronized
  fun stop(): JSONObject? {
    if (state == State.IDLE) {
      return null
    }
    val wasWaiting = state == State.WAITING_KEYFRAME
    if (wasWaiting && error.isEmpty()) {
      error = "NO_KEYFRAME"
    }
    val stoppedWallMs = System.currentTimeMillis()
    val currentMuxer = muxer
    muxer = null
    if (currentMuxer != null) {
      try {
        currentMuxer.stop()
      } catch (e: Exception) {
        if (error.isEmpty()) {
          error = "MUXER_STOP_FAILED"
        }
      }
      try {
        currentMuxer.release()
      } catch (ignored: Exception) {}
    }
    val target = file
    val ok = error.isEmpty() && frames > 0 && target != null && target.exists()
    if (!ok && target != null && target.exists()) {
      target.delete()
    }

    val json = JSONObject()
    json.put("ok", ok)
    json.put("error", if (ok) "" else error.ifEmpty { "NO_FRAMES" })
    json.put("path", if (ok && target != null) target.absolutePath else "")
    json.put("width", width)
    json.put("height", height)
    json.put("frames", frames)
    json.put("keyFrames", keyFrames)
    json.put("bytes", bytes)
    json.put("mediaDurationMs", lastPtsUs / 1000)
    json.put("wallMs", if (firstSampleWallMs > 0) stoppedWallMs - firstSampleWallMs else 0L)
    json.put("waitedForKeyframeMs", if (firstSampleWallMs > 0) firstSampleWallMs - startedWallMs else stoppedWallMs - startedWallMs)
    json.put("skippedBeforeStart", droppedBeforeStart)
    json.put("nonMonotonic", nonMonotonic)
    json.put("csdFromFormat", csdFromFormat)
    state = State.IDLE
    file = null
    return json
  }

  private fun fail(code: String) {
    if (error.isEmpty()) {
      error = code
    }
    state = State.FAILED
  }
}