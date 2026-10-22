package com.tonestage.app.yi

import android.net.Network
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import org.json.JSONException
import org.json.JSONObject

/**
 * Talks to the Yi camera's control port. Community documentation describes the sequence:
 *   1. {"msg_id":257,"token":0,"param":0}                  -> reply "param" is a session token
 *   2. {"msg_id":259,"token":<token>,"param":"none_force"}  -> starts the live view
 * Verified on one physical camera with a PC probe script; not yet verified from this app.
 *
 * The connection stays open after activation (closing it may stop the stream; that is still
 * unconfirmed), and a background thread keeps reading so we notice when the camera goes away.
 */
class YiControlClient {

  @Volatile private var socket: Socket? = null
  @Volatile private var active = false

  fun isActive(): Boolean = active

  @Synchronized
  fun activate(network: Network, host: String, port: Int, timeoutMs: Int): Int {
    close()
    val deadline = System.nanoTime() + timeoutMs * 1_000_000L
    val newSocket = network.socketFactory.createSocket()
    try {
      newSocket.tcpNoDelay = true
      try {
        newSocket.connect(InetSocketAddress(host, port), timeoutMs)
      } catch (e: SocketTimeoutException) {
        throw YiControlException("TIMEOUT", "Connect to $host:$port timed out")
      } catch (e: IOException) {
        throw YiControlException("CONNECTION_FAILED", e.message ?: "Connect failed")
      }

      val input = BufferedReader(InputStreamReader(newSocket.getInputStream(), Charsets.UTF_8))
      val output = newSocket.getOutputStream()

      send(output, """{"msg_id":257,"token":0,"param":0}""")
      val auth = awaitReply(newSocket, input, 257, deadline)
      if (auth.optInt("rval", -999) != 0 || !auth.has("param")) {
        throw YiControlException("REJECTED", "Authentication refused: $auth")
      }
      val token = auth.optInt("param", -1)

      send(output, """{"msg_id":259,"token":$token,"param":"none_force"}""")
      val start = awaitReply(newSocket, input, 259, deadline)
      if (start.optInt("rval", -999) != 0) {
        throw YiControlException("REJECTED", "Start live view refused: $start")
      }

      newSocket.soTimeout = 0
      socket = newSocket
      active = true
      startReader(newSocket, input)
      return token
    } catch (e: Exception) {
      try {
        newSocket.close()
      } catch (ignored: IOException) {}
      throw e
    }
  }

  @Synchronized
  fun close() {
    active = false
    val old = socket
    socket = null
    if (old != null) {
      try {
        old.close()
      } catch (ignored: IOException) {}
    }
  }

  private fun startReader(owner: Socket, input: BufferedReader) {
    val thread = Thread {
      try {
        // Camera events (battery, vf_start, ...) are read and ignored for now.
        while (readMessage(input) != null) {}
      } catch (ignored: IOException) {}
      if (socket === owner) {
        active = false
      }
    }
    thread.isDaemon = true
    thread.name = "YiControlReader"
    thread.start()
  }

  private fun send(output: java.io.OutputStream, text: String) {
    try {
      output.write(text.toByteArray(Charsets.UTF_8))
      output.flush()
    } catch (e: IOException) {
      throw YiControlException("CONNECTION_FAILED", e.message ?: "Write failed")
    }
  }

  /** Waits for the reply to [msgId]. Camera events with other msg_id values are skipped. */
  private fun awaitReply(
      socket: Socket,
      input: BufferedReader,
      msgId: Int,
      deadline: Long,
  ): JSONObject {
    while (true) {
      val remainingMs = (deadline - System.nanoTime()) / 1_000_000L
      if (remainingMs <= 0) {
        throw YiControlException("TIMEOUT", "No reply to msg_id $msgId")
      }
      socket.soTimeout = remainingMs.toInt()
      val text: String? =
          try {
            readMessage(input)
          } catch (e: SocketTimeoutException) {
            throw YiControlException("TIMEOUT", "No reply to msg_id $msgId")
          } catch (e: IOException) {
            throw YiControlException("CONNECTION_FAILED", e.message ?: "Read failed")
          }
      if (text == null) {
        throw YiControlException("CLOSED", "Camera closed the connection")
      }
      val json =
          try {
            JSONObject(text)
          } catch (e: JSONException) {
            throw YiControlException("BAD_REPLY", "Not valid JSON: $text")
          }
      if (json.optInt("msg_id", -1) == msgId) {
        return json
      }
    }
  }

  /**
   * The camera sends JSON objects with no delimiter between them, so objects are cut out by
   * brace depth (ignoring braces inside strings). Returns null when the stream ends.
   */
  private fun readMessage(input: BufferedReader): String? {
    val sb = StringBuilder()
    var depth = 0
    var inString = false
    var escaped = false
    while (true) {
      val code = input.read()
      if (code == -1) {
        return null
      }
      val c = code.toChar()
      if (depth == 0 && c != '{') {
        continue
      }
      sb.append(c)
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (c == '\\') {
          escaped = true
        } else if (c == '"') {
          inString = false
        }
        continue
      }
      if (c == '"') {
        inString = true
      } else if (c == '{') {
        depth++
      } else if (c == '}') {
        depth--
        if (depth == 0) {
          return sb.toString()
        }
      }
    }
  }
}