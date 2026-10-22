package com.tonestage.app.yi

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities

/**
 * The camera's Wi-Fi has no internet, so Android may prefer mobile data for normal sockets.
 * Sockets created from the Wi-Fi Network's own socketFactory are tied to that Wi-Fi network.
 */
@Suppress("DEPRECATION")
internal fun findWifiNetwork(context: Context): Network? {
  val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  return manager.allNetworks.firstOrNull { network ->
    manager.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ==
        true
  }
}