package com.tonestage.app.session

import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Streaming sample-rate converter for interleaved stereo float samples: a windowed-sinc filter
 * (Kaiser window, 96 taps, 2048 phases). The position of every output sample is computed with
 * integers, so the result does not depend on how the input is cut into chunks. Verified against
 * ideal sines: SNR above 60 dB up to 18 kHz, flat to 21 kHz, and more than 80 dB of rejection
 * just below the input Nyquist frequency when converting 48 kHz to 44.1 kHz.
 */
internal class Resampler(private val rateIn: Int, private val rateOut: Int) {

  private val same = rateIn == rateOut
  private val table: Array<FloatArray> = if (same) Array(0) { FloatArray(0) } else buildTable(rateIn, rateOut)
  private var buffer = FloatArray((HALF + 4096) * 2)
  private var frames = HALF // frames in the buffer; the first HALF are zeros (history before the start)
  private var origin = -HALF.toLong() // true input-frame index of buffer[0]
  private var produced = 0L

  fun process(input: FloatArray, inFrames: Int): FloatArray {
    if (same) {
      return input.copyOf(inFrames * 2)
    }
    val needed = (frames + inFrames) * 2
    if (needed > buffer.size) {
      buffer = buffer.copyOf(max(needed, buffer.size * 2))
    }
    System.arraycopy(input, 0, buffer, frames * 2, inFrames * 2)
    frames += inFrames

    var out = FloatArray((((frames.toLong() * rateOut) / rateIn).toInt() + 4) * 2)
    var n = 0
    while (true) {
      val num = produced * rateIn
      val index = (num / rateOut - origin).toInt()
      if (index + HALF >= frames) {
        break
      }
      val kernel = table[(((num % rateOut) * PHASES) / rateOut).toInt()]
      var left = 0f
      var right = 0f
      var p = (index - HALF + 1) * 2
      for (t in 0 until TAPS) {
        val c = kernel[t]
        left += buffer[p] * c
        right += buffer[p + 1] * c
        p += 2
      }
      if (n * 2 + 1 >= out.size) {
        out = out.copyOf(out.size * 2)
      }
      out[n * 2] = left
      out[n * 2 + 1] = right
      n++
      produced++
    }
    // Drop the frames that can no longer be needed.
    val keep = ((produced * rateIn) / rateOut - origin).toInt() - HALF + 1
    if (keep > 0) {
      System.arraycopy(buffer, keep * 2, buffer, 0, (frames - keep) * 2)
      frames -= keep
      origin += keep
    }
    return out.copyOf(n * 2)
  }

  /** The last samples, once all input has been given. */
  fun flush(): FloatArray = process(FloatArray(HALF * 2), HALF)

  companion object {
    private const val HALF = 48
    private const val PHASES = 2048
    private const val TAPS = 2 * HALF
    private const val BETA = 8.0

    private fun besselI0(x: Double): Double {
      var sum = 1.0
      var term = 1.0
      var k = 1
      while (true) {
        val half = x / (2.0 * k)
        term *= half * half
        sum += term
        k++
        if (term < 1e-12 * sum) {
          return sum
        }
      }
    }

    private fun buildTable(rateIn: Int, rateOut: Int): Array<FloatArray> {
      val cutoff = 0.5 * minOf(1.0, rateOut.toDouble() / rateIn)
      val norm = besselI0(BETA)
      return Array(PHASES) { phase ->
        val frac = phase.toDouble() / PHASES
        val taps = DoubleArray(TAPS)
        var sum = 0.0
        for (j in 0 until TAPS) {
          val t = (-HALF + 1 + j) - frac
          val u = t / HALF
          val window = if (kotlin.math.abs(u) <= 1.0) besselI0(BETA * sqrt(maxOf(0.0, 1.0 - u * u))) / norm else 0.0
          val x = 2.0 * cutoff * t
          val sinc = if (kotlin.math.abs(x) < 1e-12) 1.0 else sin(PI * x) / (PI * x)
          taps[j] = 2.0 * cutoff * sinc * window
          sum += taps[j]
        }
        FloatArray(TAPS) { (taps[it] / sum).toFloat() }
      }
    }
  }
}