package com.tonestage.app.yi

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import java.io.File

/**
 * Plays the camera's RTSP stream with Media3. Reports only what the player really knows:
 * preparing, first frame rendered (with the decoded size), or an error code.
 *
 * Transport: forcing RTP over TCP FAILED on the physical Yi camera (ERROR_CODE_IO_UNSPECIFIED), and
 * Media3's default (UDP first) works. The RTSP control socket comes from the Wi-Fi network's socket
 * factory, but Media3's UDP sockets are not bound to Wi-Fi. This was only tested with mobile data
 * OFF; with mobile data on, Android may route the UDP packets over the cellular network.
 */
@OptIn(UnstableApi::class)
class YiVideoView(context: Context) : PlayerView(context) {

  private var player: ExoPlayer? = null
  private val recorder = StreamRecorder()
  private var currentSource: String? = null

  init {
    useController = false
    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
  }

  private val listener =
      object : Player.Listener {
        override fun onRenderedFirstFrame() {
          emitPlaying()
        }

        override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) {
          if (renderedFirstFrame) {
            emitPlaying()
          }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
          if (playbackState == Player.STATE_ENDED) {
            emit("error", 0, 0, "STREAM_ENDED")
          }
        }

        override fun onPlayerError(error: PlaybackException) {
          // ERROR_CODE_IO_UNSPECIFIED covers many RTSP failures, so also forward the underlying
          // reason (shortened) to make failures diagnosable from the screen.
          val detail = (error.cause?.message ?: error.message).orEmpty().take(160)
          val text = if (detail.isEmpty()) error.errorCodeName else "${error.errorCodeName}: $detail"
          finishRecording()
          emit("error", 0, 0, text)
        }
      }

  private var renderedFirstFrame = false

  fun setSource(source: String?) {
    if (source == currentSource) {
      return
    }
    currentSource = source
    release()
    if (source.isNullOrBlank()) {
      return
    }
    start(source)
  }

  private fun start(source: String) {
    val network = findWifiNetwork(context)
    if (network == null) {
      emit("error", 0, 0, "NO_WIFI")
      return
    }
    renderedFirstFrame = false
    val mediaSource =
        RtspMediaSource.Factory()
            // setForceUseRtpTcp(true) fails on the Yi camera; see the class comment.
            .setSocketFactory(network.socketFactory)
            .setTimeoutMs(10_000)
            .createMediaSource(MediaItem.fromUri(source))
    // Small buffers: this is a live preview, not a download.
    val loadControl = DefaultLoadControl.Builder().setBufferDurationsMs(500, 1500, 250, 500).build()
    val newPlayer =
        ExoPlayer.Builder(context, RecordingRenderersFactory(context, recorder))
            .setLoadControl(loadControl)
            .build()
    newPlayer.addListener(listener)
    newPlayer.setMediaSource(mediaSource)
    newPlayer.playWhenReady = true
    newPlayer.prepare()
    player = newPlayer
    setPlayer(newPlayer)
    emit("preparing", 0, 0, "")
  }

  fun release() {
    recorder.stop()
    setPlayer(null)
    player?.let {
      it.removeListener(listener)
      it.release()
    }
    player = null
    renderedFirstFrame = false
  }

  /**
   * Starts or stops writing the incoming H.264 stream to an MP4 in the app cache folder. Stopping
   * reports the measured result with a "recorded" event.
   */
  fun setRecording(on: Boolean) {
    if (on) {
      if (player == null) {
        return
      }
      recorder.onStarted = { post { emit("recording", 0, 0, "") } }
      recorder.start(File(context.cacheDir, "video_${System.currentTimeMillis()}.mp4"))
    } else {
      finishRecording()
    }
  }

  private fun finishRecording() {
    val result = recorder.stop() ?: return
    recorder.onStarted = null
    emit("recorded", 0, 0, result.toString())
  }

  private fun emitPlaying() {
    renderedFirstFrame = true
    val size = player?.videoSize
    emit("playing", size?.width ?: 0, size?.height ?: 0, "")
  }

  private fun emit(state: String, width: Int, height: Int, message: String) {
    val reactContext = context as? ReactContext ?: return
    val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
    val payload =
        Arguments.createMap().apply {
          putString("state", state)
          putInt("width", width)
          putInt("height", height)
          putString("message", message)
        }
    dispatcher?.dispatchEvent(PlayerStateEvent(surfaceId, id, payload))
  }

  // React Native does not re-run Android layout when a child view asks for it, and Media3's
  // PlayerView does that when the video size becomes known. Without this, the video can stay
  // invisible or the wrong size. (Common workaround for native video views; unverified here.)
  // A lambda is used instead of a stored Runnable field because the PlayerView constructor can
  // call requestLayout() before this class's own fields are initialized.
  override fun requestLayout() {
    super.requestLayout()
    post { measureAndLayoutNow() }
  }

  private fun measureAndLayoutNow() {
    if (width == 0 || height == 0) {
      return
    }
    measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    layout(left, top, right, bottom)
  }

  inner class PlayerStateEvent(surfaceId: Int, viewId: Int, private val payload: WritableMap) :
      Event<PlayerStateEvent>(surfaceId, viewId) {
    override fun getEventName() = "onPlayerState"

    override fun getEventData() = payload
  }
}