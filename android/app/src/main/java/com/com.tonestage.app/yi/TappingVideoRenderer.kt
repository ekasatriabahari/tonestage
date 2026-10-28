package com.tonestage.app.yi

import android.content.Context
import android.os.Handler
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.decoder.DecoderInputBuffer
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.FormatHolder
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.metadata.MetadataOutput
import androidx.media3.exoplayer.text.TextOutput
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer
import androidx.media3.exoplayer.video.VideoRendererEventListener

/**
 * A normal video renderer that also hands every compressed sample, just before it is queued into
 * the decoder, to the [StreamRecorder]. Playback on screen behaves exactly as before.
 */
@OptIn(UnstableApi::class)
internal class TappingVideoRenderer(
    builder: MediaCodecVideoRenderer.Builder,
    private val recorder: StreamRecorder,
) : MediaCodecVideoRenderer(builder) {

  override fun onInputFormatChanged(formatHolder: FormatHolder): DecoderReuseEvaluation? {
    val evaluation = super.onInputFormatChanged(formatHolder)
    val format = formatHolder.format
    if (format != null) {
      recorder.onFormat(format)
    }
    return evaluation
  }

  override fun onQueueInputBuffer(buffer: DecoderInputBuffer) {
    super.onQueueInputBuffer(buffer)
    val data = buffer.data
    if (data != null && !buffer.isEndOfStream) {
      recorder.onSample(data, buffer.timeUs, buffer.isKeyFrame)
    }
  }
}

/** The default renderers, except that the video renderer is replaced by [TappingVideoRenderer]. */
@OptIn(UnstableApi::class)
internal class RecordingRenderersFactory(
    private val appContext: Context,
    private val recorder: StreamRecorder,
) : DefaultRenderersFactory(appContext) {

  override fun createRenderers(
      eventHandler: Handler,
      videoRendererEventListener: VideoRendererEventListener,
      audioRendererEventListener: AudioRendererEventListener,
      textRendererOutput: TextOutput,
      metadataRendererOutput: MetadataOutput,
  ): Array<Renderer> {
    val defaults =
        super.createRenderers(
            eventHandler,
            videoRendererEventListener,
            audioRendererEventListener,
            textRendererOutput,
            metadataRendererOutput,
        )
    return Array(defaults.size) { index ->
      val renderer = defaults[index]
      if (renderer is MediaCodecVideoRenderer) {
        TappingVideoRenderer(
            MediaCodecVideoRenderer.Builder(appContext)
                .setAllowedJoiningTimeMs(5000)
                .setEnableDecoderFallback(true)
                .setEventHandler(eventHandler)
                .setEventListener(videoRendererEventListener)
                .setMaxDroppedFramesToNotify(50),
            recorder,
        )
      } else {
        renderer
      }
    }
  }
}