package com.tonestage.app.backing

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/** One EQ band as sent from JavaScript. [kind] is "hpf" (high-pass) or "peak" (bell). */
internal class EqBandSettings(
    val kind: String,
    val enabled: Boolean,
    val freq: Float,
    val gainDb: Float,
    val q: Float,
)

internal class EqSettings(val enabled: Boolean, val bands: List<EqBandSettings>)

/**
 * A chain of biquad filters (the standard "Audio EQ Cookbook" designs by R. Bristow-Johnson), run
 * on interleaved float samples. IIR filters add no delay. Filter memory is kept per stage and
 * channel, so changing a setting while playing does not cause a break in the sound.
 */
internal class BiquadEq(private val sampleRate: Int, private val channels: Int) {

  private class Stage(
      val b0: Double,
      val b1: Double,
      val b2: Double,
      val a1: Double,
      val a2: Double,
  )

  private var stages: List<Stage> = emptyList()
  private var z1 = Array(0) { DoubleArray(0) }
  private var z2 = Array(0) { DoubleArray(0) }

  fun configure(settings: EqSettings) {
    val built = ArrayList<Stage>()
    if (settings.enabled) {
      for (band in settings.bands) {
        val stage = design(band)
        if (stage != null) {
          built.add(stage)
        }
      }
    }
    if (built.size != stages.size) {
      z1 = Array(built.size) { DoubleArray(channels) }
      z2 = Array(built.size) { DoubleArray(channels) }
    }
    stages = built
  }

  /** Filters [count] interleaved samples in place ([count] is a whole number of frames). */
  fun process(data: FloatArray, count: Int) {
    val frames = count / channels
    for (s in stages.indices) {
      val stage = stages[s]
      for (c in 0 until channels) {
        var s1 = z1[s][c]
        var s2 = z2[s][c]
        var index = c
        for (i in 0 until frames) {
          val x = data[index].toDouble()
          val y = stage.b0 * x + s1
          s1 = stage.b1 * x - stage.a1 * y + s2
          s2 = stage.b2 * x - stage.a2 * y
          data[index] = y.toFloat()
          index += channels
        }
        z1[s][c] = s1
        z2[s][c] = s2
      }
    }
  }

  private fun design(band: EqBandSettings): Stage? {
    if (!band.enabled) {
      return null
    }
    val fs = sampleRate.toDouble()
    val f0 = band.freq.toDouble().coerceIn(20.0, fs * 0.45)
    val q = band.q.toDouble().coerceIn(0.2, 10.0)
    val w0 = 2.0 * PI * f0 / fs
    val cosW = cos(w0)
    val alpha = sin(w0) / (2.0 * q)

    val c: DoubleArray =
        if (band.kind == "hpf") {
          doubleArrayOf(
              (1.0 + cosW) / 2.0,
              -(1.0 + cosW),
              (1.0 + cosW) / 2.0,
              1.0 + alpha,
              -2.0 * cosW,
              1.0 - alpha,
          )
        } else {
          val gainDb = band.gainDb.toDouble().coerceIn(-18.0, 9.0)
          if (abs(gainDb) < 0.05) {
            return null
          }
          val a = 10.0.pow(gainDb / 40.0)
          doubleArrayOf(
              1.0 + alpha * a,
              -2.0 * cosW,
              1.0 - alpha * a,
              1.0 + alpha / a,
              -2.0 * cosW,
              1.0 - alpha / a,
          )
        }
    // c = [b0, b1, b2, a0, a1, a2]
    return Stage(c[0] / c[3], c[1] / c[3], c[2] / c[3], c[4] / c[3], c[5] / c[3])
  }
}