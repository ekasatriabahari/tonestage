package com.tonestage.app.backing

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioTimestamp
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.tonestage.app.audio.ChannelStats
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONObject

internal class BackingException(val code: String) : Exception(code)

/**
 * Plays a local audio file: the file is decoded to PCM (MediaExtractor + MediaCodec, or read
 * directly for WAV) and written to an AudioTrack. Volume and mute are applied to the samples, and
 * the levels reported are measured on those samples. AudioTrack timestamps give the exact moment each
 * frame leaves the output on the System.nanoTime() clock, which is what later synchronization needs.
 *
 * Supported: 1 or 2 channels, 16-bit or float PCM (from the decoder or a WAV file).
 */
internal class BackingTrackEngine(private val context: Context) {

  private enum class State {
    IDLE,
    STOPPED,
    PLAYING,
    PAUSED,
    ENDED,
    ERROR,
  }

  private val lock = Any()
  @Volatile private var state = State.IDLE
  @Volatile private var error = ""
  @Volatile private var gain = 1.0f
  @Volatile private var muted = false
  @Volatile private var requestedDevice: AudioDeviceInfo? = null
  @Volatile private var stopFlag = false
  @Volatile private var wantPaused = false
  @Volatile private var seekRequestUs = -1L

  private var uri: Uri? = null
  private var name = ""
  private var durationUs = 0L
  private var sampleRateOfFile = 0
  private var channelsOfFile = 0
  private var mimeOfFile = ""
  @Volatile private var startAtUs = 0L
  private var worker: Thread? = null

  // Written by the worker, read when JavaScript asks for the status.
  @Volatile private var liveTrack: AudioTrack? = null
  @Volatile private var liveRate = 0
  @Volatile private var liveChannels = 0
  @Volatile private var baseFrame = 0L
  @Volatile private var liveStartUs = 0L
  private var stats: ChannelStats? = null
  private val timestamp = AudioTimestamp()

  // ---- file ---------------------------------------------------------------------------------------

  /** Reads the format of [target] without playing it. Returns {ok, error, name, durationMs, ...}. */
  fun load(target: Uri, displayName: String): JSONObject {
    stop()
    val result = JSONObject()
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(context, target, null)
      var found = false
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
        if (!mime.startsWith("audio/")) {
          continue
        }
        val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        if (channels > 2) {
          return failure("UNSUPPORTED_CHANNELS")
        }
        if (mime == MediaFormat.MIMETYPE_AUDIO_RAW && format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
          val encoding = format.getInteger(MediaFormat.KEY_PCM_ENCODING)
          if (encoding != AudioFormat.ENCODING_PCM_16BIT && encoding != AudioFormat.ENCODING_PCM_FLOAT) {
            return failure("UNSUPPORTED_WAV_FORMAT")
          }
        }
        durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
        sampleRateOfFile = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        channelsOfFile = channels
        mimeOfFile = mime
        found = true
        break
      }
      if (!found) {
        return failure("NO_AUDIO_TRACK")
      }
    } catch (e: Exception) {
      return failure("OPEN_FAILED")
    } finally {
      try {
        extractor.release()
      } catch (ignored: Exception) {}
    }
    uri = target
    name = displayName
    startAtUs = 0L
    state = State.STOPPED
    error = ""
    result.put("ok", true)
    result.put("error", "")
    result.put("name", displayName)
    result.put("durationMs", durationUs / 1000)
    result.put("sampleRate", sampleRateOfFile)
    result.put("channels", channelsOfFile)
    result.put("mime", mimeOfFile)
    return result
  }

  fun unload() {
    stop()
    uri = null
    name = ""
    durationUs = 0L
    state = State.IDLE
  }

  // ---- transport ----------------------------------------------------------------------------------

  fun play() {
    synchronized(lock) {
      if (uri == null) {
        return
      }
      when (state) {
        State.PAUSED -> wantPaused = false
        State.PLAYING -> {}
        else -> startWorker(startAtUs)
      }
    }
  }

  fun pause() {
    synchronized(lock) {
      if (state == State.PLAYING) {
        wantPaused = true
      }
    }
  }

  fun stop() {
    var current: Thread? = null
    synchronized(lock) {
      stopFlag = true
      wantPaused = false
      current = worker
      worker = null
    }
    if (current != null) {
      try {
        current.join(2000)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
      }
    }
    synchronized(lock) {
      startAtUs = 0L
      liveStartUs = 0L
      if (uri != null) {
        state = State.STOPPED
      }
    }
  }

  fun seekTo(positionMs: Long) {
    val target = (positionMs * 1000).coerceIn(0L, if (durationUs > 0) durationUs else Long.MAX_VALUE)
    synchronized(lock) {
      if (uri == null) {
        return
      }
      if (state == State.PLAYING || state == State.PAUSED) {
        seekRequestUs = target
        liveStartUs = target
      } else {
        startAtUs = target
        liveStartUs = target
        if (state == State.ENDED) {
          state = State.STOPPED
        }
      }
    }
  }

  fun setGain(volume: Float, isMuted: Boolean) {
    gain = volume.coerceIn(0f, 1f)
    muted = isMuted
  }

  fun setOutputDevice(device: AudioDeviceInfo?) {
    requestedDevice = device
    try {
      liveTrack?.setPreferredDevice(device)
    } catch (ignored: Exception) {}
  }

  // ---- status -------------------------------------------------------------------------------------

  fun snapshot(): JSONObject {
    val json = JSONObject()
    json.put("state", state.name.lowercase())
    json.put("error", error)
    json.put("name", name)
    json.put("durationMs", durationUs / 1000)

    val track = liveTrack
    val rate = liveRate
    var positionMs = liveStartUs / 1000
    var hasAnchor = false
    var anchorFileUs = 0L
    var anchorNanoUs = 0L
    var routedId = -1
    var routedName = ""
    if (track != null && rate > 0) {
      try {
        val head = track.playbackHeadPosition.toLong() and 0xFFFFFFFFL
        positionMs = (baseFrame + head) * 1000 / rate
        if (state == State.PLAYING && track.getTimestamp(timestamp)) {
          hasAnchor = true
          anchorNanoUs = timestamp.nanoTime / 1000
          anchorFileUs = (baseFrame + timestamp.framePosition) * 1_000_000L / rate
        }
        val routed = track.routedDevice
        if (routed != null) {
          routedId = routed.id
          routedName = routed.productName?.toString() ?: ""
        }
      } catch (ignored: IllegalStateException) {}
    }
    if (state == State.ENDED && durationUs > 0) {
      positionMs = durationUs / 1000
    }
    json.put("positionMs", positionMs)
    json.put("sampleRate", if (rate > 0) rate else sampleRateOfFile)
    json.put("channels", if (liveChannels > 0) liveChannels else channelsOfFile)
    json.put("hasAnchor", hasAnchor)
    json.put("anchorFileUs", anchorFileUs)
    json.put("anchorNanoUs", anchorNanoUs)
    json.put("routedDeviceId", routedId)
    json.put("routedDeviceName", routedName)
    json.put("requestedDeviceId", requestedDevice?.id ?: -1)
    synchronized(lock) {
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

  // ---- worker -------------------------------------------------------------------------------------

  private fun startWorker(fromUs: Long) {
    stopFlag = false
    wantPaused = false
    seekRequestUs = -1L
    error = ""
    liveStartUs = fromUs
    state = State.PLAYING
    val thread = Thread { runWorker(fromUs) }
    thread.isDaemon = true
    thread.name = "ToneStageBackingTrack"
    worker = thread
    thread.start()
  }

  private fun runWorker(startUs: Long) {
    val source = uri ?: return
    val session = Session(source)
    var finalState = State.STOPPED
    try {
      session.open(startUs)
      while (!stopFlag) {
        val request = seekRequestUs
        if (request >= 0) {
          seekRequestUs = -1L
          session.seek(request)
        }
        if (wantPaused) {
          session.pauseTrack()
          state = State.PAUSED
          Thread.sleep(20)
          continue
        }
        state = State.PLAYING
        session.ensurePlaying()
        if (session.pump()) {
          finalState = State.ENDED
          break
        }
      }
    } catch (e: BackingException) {
      error = e.code
      finalState = State.ERROR
    } catch (e: Exception) {
      error = "PLAYBACK_FAILED"
      finalState = State.ERROR
    } finally {
      session.close()
    }
    if (!stopFlag) {
      startAtUs = 0L
      liveStartUs = 0L
      state = finalState
    }
  }

  /** Everything that belongs to one run of the worker: extractor, decoder and AudioTrack. */
  private inner class Session(private val source: Uri) {
    private val extractor = MediaExtractor()
    private var codec: MediaCodec? = null
    private var isRaw = false
    private var rate = 0
    private var channels = 0
    private var encoding = AudioFormat.ENCODING_PCM_16BIT
    private var track: AudioTrack? = null
    private var trackPlaying = false
    private var needBase = true
    private var inputDone = false
    private var outputDone = false
    private var pending: ShortArray? = null
    private var pendingPos = 0
    private var framesWritten = 0L
    private val info = MediaCodec.BufferInfo()
    private val rawBuffer = ByteBuffer.allocate(32 * 1024)

    fun open(startUs: Long) {
      extractor.setDataSource(context, source, null)
      var format: MediaFormat? = null
      var mime = ""
      var trackIndex = -1
      for (i in 0 until extractor.trackCount) {
        val candidate = extractor.getTrackFormat(i)
        val candidateMime = candidate.getString(MediaFormat.KEY_MIME) ?: ""
        if (candidateMime.startsWith("audio/")) {
          extractor.selectTrack(i)
          format = candidate
          mime = candidateMime
          trackIndex = i
          break
        }
      }
      val chosen: MediaFormat = format ?: throw BackingException("NO_AUDIO_TRACK")
      rate = chosen.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      channels = chosen.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      if (channels > 2) {
        throw BackingException("UNSUPPORTED_CHANNELS")
      }
      if (chosen.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
        encoding = chosen.getInteger(MediaFormat.KEY_PCM_ENCODING)
      }
      isRaw = mime == MediaFormat.MIMETYPE_AUDIO_RAW
      if (isRaw) {
        if (encoding != AudioFormat.ENCODING_PCM_16BIT && encoding != AudioFormat.ENCODING_PCM_FLOAT) {
          throw BackingException("UNSUPPORTED_WAV_FORMAT")
        }
      } else {
        codec = startDecoder(mime, chosen, trackIndex)
      }
      synchronized(lock) { stats = ChannelStats(channels) }
      liveRate = rate
      liveChannels = channels
      if (startUs > 0) {
        extractor.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
      }
    }

    /**
     * Starts a decoder that is asked for float output. Hot masters often decode to values slightly
     * above full scale; a float pipeline keeps them until the volume has been applied, whereas
     * 16-bit output would already have flattened the peaks. If the codec does not accept the
     * request, the plain (16-bit) configuration is used.
     */
    private fun startDecoder(mime: String, format: MediaFormat, trackIndex: Int): MediaCodec {
      val requested = MediaCodec.createDecoderByType(mime)
      try {
        format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_FLOAT)
        requested.configure(format, null, null, 0)
        requested.start()
        return requested
      } catch (e: Exception) {
        try {
          requested.release()
        } catch (ignored: Exception) {}
      }
      val plain = MediaCodec.createDecoderByType(mime)
      plain.configure(extractor.getTrackFormat(trackIndex), null, null, 0)
      plain.start()
      return plain
    }

    fun seek(us: Long) {
      closeTrack()
      codec?.flush()
      extractor.seekTo(us, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
      inputDone = false
      outputDone = false
      pending = null
      pendingPos = 0
      needBase = true
      framesWritten = 0L
    }

    fun pauseTrack() {
      val current = track
      if (current != null && trackPlaying) {
        current.pause()
        trackPlaying = false
      }
    }

    fun ensurePlaying() {
      val current = track
      if (current != null && !trackPlaying) {
        current.play()
        trackPlaying = true
      }
    }

    /** Does a little work. Returns true once the whole file has been played out. */
    fun pump(): Boolean {
      if (pending == null && !outputDone) {
        fetch()
      }
      val chunk = pending
      if (chunk != null) {
        write(chunk)
        return false
      }
      if (outputDone) {
        val current = track ?: return true
        val head = current.playbackHeadPosition.toLong() and 0xFFFFFFFFL
        if (head >= framesWritten) {
          return true
        }
        Thread.sleep(10)
      }
      return false
    }

    private fun fetch() {
      val decoder = codec
      if (decoder == null) {
        fetchRaw()
        return
      }
      if (!inputDone) {
        val index = decoder.dequeueInputBuffer(0)
        if (index >= 0) {
          val buffer = decoder.getInputBuffer(index) ?: throw BackingException("DECODER_BUFFER")
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) {
            decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
            extractor.advance()
          }
        }
      }
      val out = decoder.dequeueOutputBuffer(info, 5000)
      if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        val newFormat = decoder.outputFormat
        updateFormat(newFormat)
      } else if (out >= 0) {
        if (info.size > 0) {
          val outBuffer = decoder.getOutputBuffer(out)
          if (outBuffer != null) {
            outBuffer.position(info.offset)
            outBuffer.limit(info.offset + info.size)
            makeChunk(outBuffer, info.presentationTimeUs)
          }
        }
        decoder.releaseOutputBuffer(out, false)
        if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
          outputDone = true
        }
      }
    }

    private fun fetchRaw() {
      rawBuffer.clear()
      val size = extractor.readSampleData(rawBuffer, 0)
      if (size < 0) {
        outputDone = true
        return
      }
      val time = extractor.sampleTime
      rawBuffer.position(0)
      rawBuffer.limit(size)
      makeChunk(rawBuffer, time)
      extractor.advance()
    }

    private fun updateFormat(newFormat: MediaFormat) {
      val newRate = newFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val newChannels = newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val newEncoding =
          if (newFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
            newFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
          } else {
            AudioFormat.ENCODING_PCM_16BIT
          }
      if (newChannels > 2) {
        throw BackingException("UNSUPPORTED_CHANNELS")
      }
      if (newEncoding != AudioFormat.ENCODING_PCM_16BIT && newEncoding != AudioFormat.ENCODING_PCM_FLOAT) {
        throw BackingException("UNSUPPORTED_PCM_FORMAT")
      }
      if (newRate != rate || newChannels != channels) {
        closeTrack()
        rate = newRate
        channels = newChannels
        synchronized(lock) { stats = ChannelStats(channels) }
        liveRate = rate
        liveChannels = channels
        needBase = true
        framesWritten = 0L
      }
      encoding = newEncoding
    }

    /** Converts decoded bytes to 16-bit samples, applies volume/mute and measures the levels. */
    private fun makeChunk(data: ByteBuffer, presentationUs: Long) {
      data.order(ByteOrder.LITTLE_ENDIAN)
      val factor = if (muted) 0f else gain
      val samples: ShortArray
      if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
        // Volume is applied in float, before anything is clamped to 16 bits.
        val floats = data.asFloatBuffer()
        samples = ShortArray(floats.remaining())
        for (i in samples.indices) {
          samples[i] = (floats.get(i) * factor * 32767f).toInt().coerceIn(-32768, 32767).toShort()
        }
      } else {
        val shorts = data.asShortBuffer()
        samples = ShortArray(shorts.remaining())
        shorts.get(samples)
        if (factor != 1f) {
          for (i in samples.indices) {
            samples[i] = (samples[i] * factor).toInt().coerceIn(-32768, 32767).toShort()
          }
        }
      }
      val usable = samples.size - samples.size % channels
      if (usable <= 0) {
        return
      }
      synchronized(lock) { stats?.add(samples, 0, usable) }
      if (needBase) {
        // File position (in frames) of the first sample that goes into the new AudioTrack.
        baseFrame = presentationUs * rate / 1_000_000L
        needBase = false
      }
      pending = if (usable == samples.size) samples else samples.copyOf(usable)
      pendingPos = 0
    }

    private fun write(chunk: ShortArray) {
      var current = track
      if (current == null) {
        current = createTrack()
        track = current
        liveTrack = current
        current.play()
        trackPlaying = true
      }
      val written = current.write(chunk, pendingPos, chunk.size - pendingPos, AudioTrack.WRITE_NON_BLOCKING)
      if (written < 0) {
        throw BackingException("WRITE_FAILED")
      }
      pendingPos += written
      framesWritten += written / channels
      if (pendingPos >= chunk.size) {
        pending = null
        pendingPos = 0
      }
      if (written == 0) {
        Thread.sleep(5)
      }
    }

    private fun createTrack(): AudioTrack {
      val mask = if (channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO
      val minBuffer = AudioTrack.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT)
      if (minBuffer <= 0) {
        throw BackingException("UNSUPPORTED_OUTPUT_FORMAT")
      }
      val bufferBytes = maxOf(minBuffer, rate * channels * 2 * 150 / 1000)
      val created =
          AudioTrack.Builder()
              .setAudioAttributes(
                  AudioAttributes.Builder()
                      .setUsage(AudioAttributes.USAGE_MEDIA)
                      .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                      .build()
              )
              .setAudioFormat(
                  AudioFormat.Builder()
                      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                      .setSampleRate(rate)
                      .setChannelMask(mask)
                      .build()
              )
              .setBufferSizeInBytes(bufferBytes)
              .setTransferMode(AudioTrack.MODE_STREAM)
              .build()
      created.setPreferredDevice(requestedDevice)
      return created
    }

    private fun closeTrack() {
      val current = track
      track = null
      liveTrack = null
      trackPlaying = false
      if (current != null) {
        try {
          current.pause()
          current.flush()
        } catch (ignored: IllegalStateException) {}
        current.release()
      }
    }

    fun close() {
      closeTrack()
      try {
        codec?.stop()
      } catch (ignored: Exception) {}
      try {
        codec?.release()
      } catch (ignored: Exception) {}
      codec = null
      try {
        extractor.release()
      } catch (ignored: Exception) {}
    }
  }

  private fun failure(code: String): JSONObject {
    val json = JSONObject()
    json.put("ok", false)
    json.put("error", code)
    return json
  }
}