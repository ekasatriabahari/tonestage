package com.tonestage.app.yi

import java.io.ByteArrayOutputStream

/** Small helpers for H.264 NAL units. Plain functions on byte arrays, no Android types. */
internal object H264Util {

  val START_CODE = byteArrayOf(0, 0, 0, 1)

  const val NAL_IDR = 5
  const val NAL_SPS = 7
  const val NAL_PPS = 8

  /** 3 or 4 when an Annex B start code (00 00 01 or 00 00 00 01) begins at [i], otherwise 0. */
  fun startCodeLength(a: ByteArray, i: Int): Int {
    if (i + 3 <= a.size && a[i] == 0.toByte() && a[i + 1] == 0.toByte()) {
      if (a[i + 2] == 1.toByte()) {
        return 3
      }
      if (i + 4 <= a.size && a[i + 2] == 0.toByte() && a[i + 3] == 1.toByte()) {
        return 4
      }
    }
    return 0
  }

  fun isAnnexB(a: ByteArray): Boolean = a.isNotEmpty() && startCodeLength(a, 0) > 0

  /**
   * Converts 4-byte-length-prefixed NAL units (AVCC style) to Annex B. Returns null when the
   * lengths do not add up exactly, which means the data was not in that format.
   */
  fun avccToAnnexB(a: ByteArray): ByteArray? {
    val out = ByteArrayOutputStream(a.size + 16)
    var i = 0
    while (i + 4 <= a.size) {
      val length =
          ((a[i].toInt() and 0xFF) shl 24) or
              ((a[i + 1].toInt() and 0xFF) shl 16) or
              ((a[i + 2].toInt() and 0xFF) shl 8) or
              (a[i + 3].toInt() and 0xFF)
      i += 4
      if (length <= 0 || length > a.size - i) {
        return null
      }
      out.write(START_CODE, 0, START_CODE.size)
      out.write(a, i, length)
      i += length
    }
    return if (i == a.size && a.isNotEmpty()) out.toByteArray() else null
  }

  /**
   * Calls [action] for every NAL unit in an Annex B buffer with its type and its byte range
   * ([start] is the NAL header byte, [end] is exclusive and excludes zero bytes that belong to the
   * next start code).
   */
  fun forEachNal(a: ByteArray, action: (type: Int, start: Int, end: Int) -> Unit) {
    var i = 0
    // find the first start code
    while (i < a.size && startCodeLength(a, i) == 0) {
      i++
    }
    while (i < a.size) {
      val codeLength = startCodeLength(a, i)
      if (codeLength == 0) {
        i++
        continue
      }
      val nalStart = i + codeLength
      var next = nalStart
      while (next < a.size && !(next + 3 <= a.size && startCodeLength(a, next) == 3)) {
        next++
      }
      var end = if (next >= a.size) a.size else next
      while (end > nalStart && a[end - 1] == 0.toByte()) {
        end--
      }
      if (nalStart < a.size && end > nalStart) {
        action(a[nalStart].toInt() and 0x1F, nalStart, end)
      }
      i = if (next >= a.size) a.size else next
    }
  }

  /** The NAL unit with a 4-byte start code in front, in the form MediaMuxer expects for csd-0/csd-1. */
  fun withStartCode(a: ByteArray, start: Int, end: Int): ByteArray {
    val out = ByteArray(START_CODE.size + (end - start))
    System.arraycopy(START_CODE, 0, out, 0, START_CODE.size)
    System.arraycopy(a, start, out, START_CODE.size, end - start)
    return out
  }
}