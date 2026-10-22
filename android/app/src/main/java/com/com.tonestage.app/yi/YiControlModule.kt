package com.tonestage.app.yi

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Implements the generated NativeYiControlSpec (see specs/NativeYiControl.ts). */
class YiControlModule(reactContext: ReactApplicationContext) : NativeYiControlSpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private val client = YiControlClient()

  override fun getName() = NAME

  override fun activateLiveView(host: String, port: Double, timeoutMs: Double, promise: Promise) {
    executor.execute {
      try {
        val network =
            findWifiNetwork(getReactApplicationContext())
                ?: throw YiControlException("NO_WIFI", "Phone is not on Wi-Fi")
        val token = client.activate(network, host, port.toInt(), timeoutMs.toInt())
        promise.resolve(token)
      } catch (e: YiControlException) {
        promise.reject(e.code, e.message)
      } catch (e: Exception) {
        promise.reject("UNKNOWN", e.message ?: "Unknown error")
      }
    }
  }

  override fun isActive(promise: Promise) {
    promise.resolve(client.isActive())
  }

  override fun deactivate(promise: Promise) {
    client.close()
    promise.resolve(null)
  }

  override fun invalidate() {
    client.close()
    executor.shutdownNow()
    super.invalidate()
  }

  companion object {
    const val NAME = "NativeYiControl"
  }
}