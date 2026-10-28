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
  private val totalClipped = LongArray(channels)
  var frames = 0L
    private set

  /** Adds [count] samples starting at [offset]; [count] must be a whole number of frames. */
  fun add(buffer: ShortArray, offset: Int, count: Int) {
    var i = offset
    val end = offset + count
    while (i + channels <= end) {
      for (c in 0 until channels) {
        val v = Math.abs(buffer[i + c].toInt())
        if (v > peak[c]) {
          peak[c] = v
        }
        if (v >= 32767) {
          clipped[c]++
          totalClipped[c]++
        }
        sumSquares[c] += v.toDouble() * v.toDouble()
      }
      i += channels
      frames++
    }
  }

  /** Starts a new measuring window. The running clipping total is kept. */
  fun resetWindow() {
    peak.fill(0)
    sumSquares.fill(0.0)
    clipped.fill(0)
    frames = 0
  }

  fun peaksJson(): JSONArray = JSONArray(peak.map { it / 32768.0 })

  fun rmsJson(): JSONArray =
      JSONArray(sumSquares.map { if (frames > 0) Math.sqrt(it / frames) / 32768.0 else 0.0 })

  fun clippedJson(): JSONArray = JSONArray(clipped.toList())

  fun totalClippedJson(): JSONArray = JSONArray(totalClipped.toList())
}

/** Writes 16-bit PCM WAV. The 44-byte header is filled in when the file is closed. */
internal class WavWriter(file: File, private val sampleRate: Int, private val channels: Int) {
  private val raf = RandomAccessFile(file, "rw")
  private var dataBytes = 0L

  init {
    raf.setLength(0)
    raf.write(ByteArray(44))
  }

  fun write(buffer: ShortArray, offset: Int, count: Int) {
    val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in offset until offset + count) {
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

internal class OpenedRecord(val record: AudioRecord?, val source: String, val error: String)

internal object AudioCapture {

  private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT

  /**
   * The first part of a capture from the Pocket Master was measured as exact zeros (about 11 ms in
   * the test file), so the first 100 ms of every capture are discarded.
   */
  const val SKIP_START_MS = 100

  /**
   * Creates an AudioRecord for [device]. Nothing is assumed: a format Android refuses is reported
   * with a code. UNPROCESSED asks Android not to apply gain control or noise suppression (better
   * for a clean guitar signal); MIC is the fallback if the phone does not offer it.
   */
  fun openRecord(device: AudioDeviceInfo, sampleRate: Int, channels: Int): OpenedRecord {
    var record: AudioRecord? = null
    var sourceName = ""
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
    val opened: AudioRecord = record ?: return OpenedRecord(null, "", "INIT_FAILED")
    if (!opened.setPreferredDevice(device)) {
      opened.release()
      return OpenedRecord(null, sourceName, "PREFERRED_DEVICE_REJECTED")
    }
    return OpenedRecord(opened, sourceName, "")
  }

  /**
   * Opens [device] with the requested format, reads for [durationMs] (after discarding the first
   * [SKIP_START_MS]) and reports what really happened.
   */
  fun captureOnce(
      device: AudioDeviceInfo,
      sampleRate: Int,
      channels: Int,
      durationMs: Long,
      sink: WavWriter?,
  ): CaptureOutcome {
    val stats = ChannelStats(channels)
    val opened = openRecord(device, sampleRate, channels)
    val rec: AudioRecord =
        opened.record ?: return CaptureOutcome(false, opened.error, opened.source, 0, 0, -1, stats)

    try {
      rec.startRecording()
      if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        return CaptureOutcome(false, "START_FAILED", opened.source, 0, 0, -1, stats)
      }

      val buffer = ShortArray(sampleRate * channels / 10)
      var toSkip = (sampleRate * SKIP_START_MS / 1000) * channels
      val endAt = System.nanoTime() + (durationMs + SKIP_START_MS) * 1_000_000L
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
          val skip = minOf(toSkip, usable)
          toSkip -= skip
          val keep = usable - skip
          if (keep > 0) {
            stats.add(buffer, skip, keep)
            sink?.write(buffer, skip, keep)
          }
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
          opened.source,
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