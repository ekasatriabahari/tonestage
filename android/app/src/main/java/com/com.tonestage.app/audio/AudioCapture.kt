package com.tonestage.app.audio

import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONArray

/** Peak / RMS / clipping per channel for interleaved 16-bit samples. Values are 0.0 to 1.0. */
internal class ChannelStats(private val channels: Int) {
  private val peak = IntArray(channels)
  private val sumSquares = DoubleArray(channels)
  private val clipped = LongArray(channels)
  var frames = 0L
    private set

  /** [count] must be a whole number of frames. */
  fun add(buffer: ShortArray, count: Int) {
    var i = 0
    while (i + channels <= count) {
      for (c in 0 until channels) {
        val v = Math.abs(buffer[i + c].toInt())
        if (v > peak[c]) {
          peak[c] = v
        }
        if (v >= 32767) {
          clipped[c]++
        }
        sumSquares[c] += v.toDouble() * v.toDouble()
      }
      i += channels
      frames++
    }
  }

  fun peaksJson(): JSONArray = JSONArray(peak.map { it / 32768.0 })

  fun rmsJson(): JSONArray =
      JSONArray(sumSquares.map { if (frames > 0) Math.sqrt(it / frames) / 32768.0 else 0.0 })

  fun clippedJson(): JSONArray = JSONArray(clipped.toList())
}

/** Writes 16-bit PCM WAV. The 44-byte header is filled in when the file is closed. */
internal class WavWriter(file: File, private val sampleRate: Int, private val channels: Int) {
  private val raf = RandomAccessFile(file, "rw")
  private var dataBytes = 0L

  init {
    raf.setLength(0)
    raf.write(ByteArray(44))
  }

  fun write(buffer: ShortArray, count: Int) {
    val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until count) {
      bytes.putShort(buffer[i])
    }
    raf.write(bytes.array())
    dataBytes += count * 2L
  }

  fun close() {
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt((36 + dataBytes).toInt())
    header.put("WAVE".toByteArray(Charsets.US_ASCII))
    header.put("fmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1) // PCM
    header.putShort(channels.toShort())
    header.putInt(sampleRate)
    header.putInt(sampleRate * channels * 2)
    header.putShort((channels * 2).toShort())
    header.putShort(16)
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(dataBytes.toInt())
    raf.seek(0)
    raf.write(header.array())
    raf.close()
  }
}

internal class CaptureOutcome(
    val ok: Boolean,
    val error: String,
    val source: String,
    val actualSampleRate: Int,
    val actualChannels: Int,
    val routedDeviceId: Int,
    val stats: ChannelStats,
)

internal object AudioCapture {

  private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT

  /**
   * Opens [device] with the requested format, reads for [durationMs] and reports what really
   * happened. Nothing is assumed: a format Android refuses or a device that delivers no data is
   * reported as a failure with a code.
   */
  fun captureOnce(
      device: AudioDeviceInfo,
      sampleRate: Int,
      channels: Int,
      durationMs: Long,
      sink: WavWriter?,
  ): CaptureOutcome {
    val stats = ChannelStats(channels)

    var record: AudioRecord? = null
    var sourceName = ""
    // UNPROCESSED asks Android not to apply gain control or noise suppression (better for a
    // clean guitar signal); MIC is the fallback if the phone does not offer it.
    val sources =
        listOf(
            MediaRecorder.AudioSource.UNPROCESSED to "UNPROCESSED",
            MediaRecorder.AudioSource.MIC to "MIC",
        )
    for ((id, name) in sources) {
      record = createRecord(sampleRate, channels, id)
      if (record != null) {
        sourceName = name
        break
      }
    }
    val rec: AudioRecord = record ?: return CaptureOutcome(false, "INIT_FAILED", "", 0, 0, -1, stats)

    try {
      if (!rec.setPreferredDevice(device)) {
        return CaptureOutcome(false, "PREFERRED_DEVICE_REJECTED", sourceName, 0, 0, -1, stats)
      }
      rec.startRecording()
      if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        return CaptureOutcome(false, "START_FAILED", sourceName, 0, 0, -1, stats)
      }

      val buffer = ShortArray(sampleRate * channels / 10)
      val endAt = System.nanoTime() + durationMs * 1_000_000L
      var lastDataAt = System.nanoTime()
      var error = ""
      while (System.nanoTime() < endAt) {
        val n = rec.read(buffer, 0, buffer.size, AudioRecord.READ_NON_BLOCKING)
        if (n < 0) {
          error = "READ_ERROR_$n"
          break
        }
        val usable = n - (n % channels)
        if (usable > 0) {
          lastDataAt = System.nanoTime()
          stats.add(buffer, usable)
          sink?.write(buffer, usable)
        } else {
          if (System.nanoTime() - lastDataAt > 2_000_000_000L) {
            error = "NO_DATA"
            break
          }
          Thread.sleep(5)
        }
      }
      val routedId = rec.routedDevice?.id ?: -1
      if (error.isEmpty() && stats.frames == 0L) {
        error = "NO_DATA"
      }
      return CaptureOutcome(
          error.isEmpty(),
          error,
          sourceName,
          rec.sampleRate,
          rec.channelCount,
          routedId,
          stats,
      )
    } finally {
      try {
        rec.stop()
      } catch (ignored: IllegalStateException) {}
      rec.release()
    }
  }

  private fun createRecord(sampleRate: Int, channels: Int, source: Int): AudioRecord? {
    val mask = if (channels == 1) AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO
    val minBuffer = AudioRecord.getMinBufferSize(sampleRate, mask, ENCODING)
    if (minBuffer <= 0) {
      return null
    }
    return try {
      val record =
          AudioRecord.Builder()
              .setAudioSource(source)
              .setAudioFormat(
                  AudioFormat.Builder()
                      .setEncoding(ENCODING)
                      .setSampleRate(sampleRate)
                      .setChannelMask(mask)
                      .build()
              )
              .setBufferSizeInBytes(minBuffer * 4)
              .build()
      if (record.state == AudioRecord.STATE_INITIALIZED) {
        record
      } else {
        record.release()
        null
      }
    } catch (e: Exception) {
      null
    }
  }
}