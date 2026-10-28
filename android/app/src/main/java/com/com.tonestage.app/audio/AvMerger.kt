package com.tonestage.app.audio

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONObject

internal class EncodedSample(val data: ByteArray, val ptsUs: Long, val flags: Int)

/**
 * Combines a recorded video MP4 and a recorded WAV into one MP4. The video samples are copied
 * unchanged (no re-encoding); the audio is encoded to AAC. Both go onto one timeline using the
 * start times measured on the shared System.nanoTime() clock.
 *
 * [videoLatencyMs]: how much later than its sound the video shows an event (the camera's
 * capture, encoding and Wi-Fi delay). The merge moves the video that much earlier. It is
 * not known in advance and must be measured, so the raw files are kept and the merge can be redone.
 */
internal object AvMerger {

  private const val CHUNK_FRAMES = 1024
  private const val AAC_BITRATE = 128_000

  private class WavInfo(val sampleRate: Int, val channels: Int, val dataBytes: Long)

  fun merge(
      videoPath: String,
      audioPath: String,
      outFile: File,
      videoStartUs: Long,
      audioStartUs: Long,
      videoLatencyMs: Long,
  ): JSONObject {
    var extractor: MediaExtractor? = null
    var codec: MediaCodec? = null
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      val wav = readWav(audioPath) ?: return failure("BAD_WAV")

      val videoExtractor = MediaExtractor()
      extractor = videoExtractor
      videoExtractor.setDataSource(videoPath)
      var videoFormat: MediaFormat? = null
      for (i in 0 until videoExtractor.trackCount) {
        val format = videoExtractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
        if (mime.startsWith("video/")) {
          videoExtractor.selectTrack(i)
          videoFormat = format
          break
        }
      }
      val checkedVideoFormat: MediaFormat = videoFormat ?: return failure("NO_VIDEO_TRACK")
      val firstVideoSampleUs = videoExtractor.sampleTime
      if (firstVideoSampleUs < 0) {
        return failure("NO_VIDEO_SAMPLES")
      }

      // Timeline. All values are on the System.nanoTime() clock, in microseconds.
      val videoFirstUs = videoStartUs - videoLatencyMs * 1000
      val origin = minOf(videoFirstUs, audioStartUs)
      val videoOffsetUs = videoFirstUs - origin - firstVideoSampleUs
      val audioOffsetUs = audioStartUs - origin

      // 1. Encode all audio to AAC in memory.
      val frameBytes = wav.channels * 2
      val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
      codec = encoder
      val audioConfig =
          MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, wav.sampleRate, wav.channels)
      audioConfig.setInteger(
          MediaFormat.KEY_AAC_PROFILE,
          MediaCodecInfo.CodecProfileLevel.AACObjectLC,
      )
      audioConfig.setInteger(MediaFormat.KEY_BIT_RATE, AAC_BITRATE)
      audioConfig.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, CHUNK_FRAMES * frameBytes * 4)
      encoder.configure(audioConfig, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      encoder.start()

      val audioSamples = ArrayList<EncodedSample>()
      var audioFormat: MediaFormat? = null
      val info = MediaCodec.BufferInfo()
      val chunk = ByteArray(CHUNK_FRAMES * frameBytes)
      var bytesLeft = wav.dataBytes
      var framesFed = 0L
      var inputDone = false
      var outputDone = false
      var idleLoops = 0
      FileInputStream(audioPath).use { fileStream ->
        fileStream.skip(44)
        val input = DataInputStream(fileStream)
        while (!outputDone) {
          var progressed = false
          if (!inputDone) {
            val index = encoder.dequeueInputBuffer(10_000)
            if (index >= 0) {
              val buffer = encoder.getInputBuffer(index) ?: return failure("ENCODER_BUFFER")
              buffer.clear()
              val want = minOf(minOf(bytesLeft, chunk.size.toLong()).toInt(), buffer.capacity())
              val ptsUs = audioOffsetUs + framesFed * 1_000_000L / wav.sampleRate
              if (want <= 0) {
                encoder.queueInputBuffer(index, 0, 0, ptsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                val aligned = want - (want % frameBytes)
                input.readFully(chunk, 0, aligned)
                buffer.put(chunk, 0, aligned)
                encoder.queueInputBuffer(index, 0, aligned, ptsUs, 0)
                framesFed += aligned / frameBytes
                bytesLeft -= aligned
              }
              progressed = true
            }
          }
          val out = encoder.dequeueOutputBuffer(info, 10_000)
          if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            audioFormat = encoder.outputFormat
            progressed = true
          } else if (out >= 0) {
            val outBuffer = encoder.getOutputBuffer(out)
            if (outBuffer != null &&
                info.size > 0 &&
                (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
              val data = ByteArray(info.size)
              outBuffer.position(info.offset)
              outBuffer.limit(info.offset + info.size)
              outBuffer.get(data)
              audioSamples.add(EncodedSample(data, info.presentationTimeUs, info.flags))
            }
            encoder.releaseOutputBuffer(out, false)
            if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
              outputDone = true
            }
            progressed = true
          }
          if (progressed) {
            idleLoops = 0
          } else if (++idleLoops > 2000) {
            return failure("ENCODER_STALLED")
          }
        }
      }
      val finalAudioFormat = audioFormat ?: return failure("NO_AUDIO_FORMAT")

      // 2. Write both tracks, interleaved by time.
      val audioMuxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      muxer = audioMuxer
      val videoTrack = audioMuxer.addTrack(checkedVideoFormat)
      val audioTrack = audioMuxer.addTrack(finalAudioFormat)
      audioMuxer.start()
      muxerStarted = true

      val sampleBuffer = ByteBuffer.allocate(2 * 1024 * 1024)
      val outInfo = MediaCodec.BufferInfo()
      var audioIndex = 0
      var videoCount = 0
      var lastVideoPtsUs = 0L
      while (true) {
        sampleBuffer.clear()
        val size = videoExtractor.readSampleData(sampleBuffer, 0)
        if (size < 0) {
          break
        }
        val videoPtsUs = videoExtractor.sampleTime + videoOffsetUs
        while (audioIndex < audioSamples.size && audioSamples[audioIndex].ptsUs <= videoPtsUs) {
          writeAudio(audioMuxer, audioTrack, audioSamples[audioIndex], outInfo)
          audioIndex++
        }
        val flags =
            if ((videoExtractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) {
              MediaCodec.BUFFER_FLAG_KEY_FRAME
            } else {
              0
            }
        outInfo.set(0, size, videoPtsUs, flags)
        audioMuxer.writeSampleData(videoTrack, sampleBuffer, outInfo)
        lastVideoPtsUs = videoPtsUs
        videoCount++
        videoExtractor.advance()
      }
      while (audioIndex < audioSamples.size) {
        writeAudio(audioMuxer, audioTrack, audioSamples[audioIndex], outInfo)
        audioIndex++
      }

      val lastAudioPtsUs = if (audioSamples.isEmpty()) 0L else audioSamples[audioSamples.size - 1].ptsUs
      val json = JSONObject()
      json.put("ok", true)
      json.put("error", "")
      json.put("path", outFile.absolutePath)
      json.put("durationMs", maxOf(lastVideoPtsUs, lastAudioPtsUs) / 1000)
      json.put("videoSamples", videoCount)
      json.put("audioSamples", audioSamples.size)
      json.put("videoLatencyMs", videoLatencyMs)
      // How long after the first (shifted) video frame the first audio frame was captured.
      json.put("audioStartsAfterVideoMs", (audioStartUs - videoFirstUs) / 1000)
      return json
    } catch (e: Exception) {
      outFile.delete()
      return failure("MERGE_FAILED")
    } finally {
      try {
        extractor?.release()
      } catch (ignored: Exception) {}
      try {
        codec?.stop()
      } catch (ignored: Exception) {}
      try {
        codec?.release()
      } catch (ignored: Exception) {}
      try {
        if (muxerStarted) {
          muxer?.stop()
        }
      } catch (ignored: Exception) {}
      try {
        muxer?.release()
      } catch (ignored: Exception) {}
    }
  }

  private fun writeAudio(
      muxer: MediaMuxer,
      track: Int,
      sample: EncodedSample,
      info: MediaCodec.BufferInfo,
  ) {
    info.set(0, sample.data.size, sample.ptsUs, sample.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME)
    muxer.writeSampleData(track, ByteBuffer.wrap(sample.data), info)
  }

  private fun failure(code: String): JSONObject {
    val json = JSONObject()
    json.put("ok", false)
    json.put("error", code)
    json.put("path", "")
    return json
  }

  /** Reads the 44-byte header written by WavWriter. Null if the file is not a 16-bit PCM WAV. */
  private fun readWav(path: String): WavInfo? {
    RandomAccessFile(path, "r").use { file ->
      if (file.length() < 44) {
        return null
      }
      val header = ByteArray(44)
      file.readFully(header)
      val bytes = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
      if (String(header, 0, 4, Charsets.US_ASCII) != "RIFF" ||
          String(header, 8, 4, Charsets.US_ASCII) != "WAVE") {
        return null
      }
      val channels = bytes.getShort(22).toInt()
      val rate = bytes.getInt(24)
      val bits = bytes.getShort(34).toInt()
      val declared = bytes.getInt(40).toLong() and 0xFFFFFFFFL
      if (bits != 16 || channels < 1 || channels > 2 || rate <= 0) {
        return null
      }
      val frameBytes = channels * 2
      val available = file.length() - 44
      val usable = minOf(declared, available)
      return WavInfo(rate, channels, usable - usable % frameBytes)
    }
  }
}