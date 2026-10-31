package com.tonestage.app.session

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal class PcmChunk(val samples: FloatArray, val frames: Int)

/**
 * Decodes an audio file to interleaved STEREO float samples, from an exact start position (the
 * decoder may land a little before or after the requested position; this is corrected so the first
 * sample returned is the one at [open]'s startUs). Mono files are duplicated to both channels.
 */
internal class PcmDecoder(private val context: Context, private val uri: Uri) {

  var sampleRate = 0
    private set
  private var sourceChannels = 0
  private val extractor = MediaExtractor()
  private var codec: MediaCodec? = null
  private var isRaw = false
  private var encoding = AudioFormat.ENCODING_PCM_16BIT
  private var inputDone = false
  private var outputDone = false
  private val info = MediaCodec.BufferInfo()
  private val rawBuffer = ByteBuffer.allocate(32 * 1024)
  private var firstOutput = true
  private var targetFrame = 0L
  private var skipFrames = 0L
  private var padFrames = 0L
  private var idle = 0

  fun open(startUs: Long) {
    extractor.setDataSource(context, uri, null)
    var chosen: MediaFormat? = null
    var mime = ""
    var index = -1
    for (i in 0 until extractor.trackCount) {
      val candidate = extractor.getTrackFormat(i)
      val candidateMime = candidate.getString(MediaFormat.KEY_MIME) ?: ""
      if (candidateMime.startsWith("audio/")) {
        extractor.selectTrack(i)
        chosen = candidate
        mime = candidateMime
        index = i
        break
      }
    }
    val format: MediaFormat = chosen ?: throw IllegalStateException("NO_AUDIO_TRACK")
    sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    sourceChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    if (sourceChannels > 2) {
      throw IllegalStateException("UNSUPPORTED_CHANNELS")
    }
    isRaw = mime == MediaFormat.MIMETYPE_AUDIO_RAW
    if (isRaw) {
      if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
        encoding = format.getInteger(MediaFormat.KEY_PCM_ENCODING)
      }
      if (encoding != AudioFormat.ENCODING_PCM_16BIT && encoding != AudioFormat.ENCODING_PCM_FLOAT) {
        throw IllegalStateException("UNSUPPORTED_WAV_FORMAT")
      }
    } else {
      codec = startDecoder(mime, format, index)
    }
    targetFrame = startUs * sampleRate / 1_000_000L
    if (startUs > 0) {
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
    }
  }

  /** The next chunk, or null at the end of the file. */
  fun read(): PcmChunk? {
    while (!outputDone) {
      val chunk = pump()
      if (chunk != null) {
        idle = 0
        return chunk
      }
      if (++idle > 20000) {
        throw IllegalStateException("DECODER_STALLED")
      }
    }
    return null
  }

  fun close() {
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

  private fun pump(): PcmChunk? {
    val decoder = codec
    if (decoder == null) {
      rawBuffer.clear()
      val size = extractor.readSampleData(rawBuffer, 0)
      if (size < 0) {
        outputDone = true
        return null
      }
      val time = extractor.sampleTime
      rawBuffer.position(0)
      rawBuffer.limit(size)
      val chunk = toChunk(rawBuffer, time)
      extractor.advance()
      return chunk
    }
    if (!inputDone) {
      val index = decoder.dequeueInputBuffer(0)
      if (index >= 0) {
        val buffer = decoder.getInputBuffer(index) ?: throw IllegalStateException("DECODER_BUFFER")
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
      encoding =
          if (newFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
            newFormat.getInteger(MediaFormat.KEY_PCM_ENCODING)
          } else {
            AudioFormat.ENCODING_PCM_16BIT
          }
      if (encoding != AudioFormat.ENCODING_PCM_16BIT && encoding != AudioFormat.ENCODING_PCM_FLOAT) {
        throw IllegalStateException("UNSUPPORTED_PCM_FORMAT")
      }
      return null
    }
    if (out < 0) {
      return null
    }
    var chunk: PcmChunk? = null
    if (info.size > 0) {
      val outBuffer = decoder.getOutputBuffer(out)
      if (outBuffer != null) {
        outBuffer.position(info.offset)
        outBuffer.limit(info.offset + info.size)
        chunk = toChunk(outBuffer, info.presentationTimeUs)
      }
    }
    decoder.releaseOutputBuffer(out, false)
    if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
      outputDone = true
    }
    return chunk
  }

  private fun toChunk(data: ByteBuffer, ptsUs: Long): PcmChunk? {
    data.order(ByteOrder.LITTLE_ENDIAN)
    val source: FloatArray
    if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
      val floats = data.asFloatBuffer()
      source = FloatArray(floats.remaining())
      floats.get(source)
    } else {
      val shorts = data.asShortBuffer()
      source = FloatArray(shorts.remaining())
      for (i in source.indices) {
        source[i] = shorts.get(i) / 32768f
      }
    }
    var frames = source.size / sourceChannels
    if (frames == 0) {
      return null
    }
    var out = FloatArray(frames * 2)
    if (sourceChannels == 1) {
      for (i in 0 until frames) {
        out[i * 2] = source[i]
        out[i * 2 + 1] = source[i]
      }
    } else {
      System.arraycopy(source, 0, out, 0, frames * 2)
    }
    if (firstOutput) {
      firstOutput = false
      val firstFrame = ptsUs * sampleRate / 1_000_000L
      val delta = firstFrame - targetFrame
      if (delta < 0) {
        skipFrames = -delta
      } else {
        padFrames = delta
      }
    }
    if (skipFrames > 0) {
      val drop = minOf(skipFrames, frames.toLong()).toInt()
      skipFrames -= drop
      if (drop >= frames) {
        return null
      }
      out = out.copyOfRange(drop * 2, frames * 2)
      frames -= drop
    }
    if (padFrames > 0) {
      val pad = minOf(padFrames, 4_800_000L).toInt()
      padFrames = 0
      val padded = FloatArray((pad + frames) * 2)
      System.arraycopy(out, 0, padded, pad * 2, frames * 2)
      out = padded
      frames += pad
    }
    return PcmChunk(out, frames)
  }
}