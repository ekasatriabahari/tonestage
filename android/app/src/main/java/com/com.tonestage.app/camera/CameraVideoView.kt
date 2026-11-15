package com.tonestage.app.camera

import android.content.Context
import android.media.MediaMetadataRetriever
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import java.io.File
import java.util.concurrent.Executor
import org.json.JSONObject

/** CameraX preview and video-only recorder for the phone's front or rear camera. */
class CameraVideoView(context: Context) : FrameLayout(context) {
  private val previewView = PreviewView(context)
  private val mainExecutor: Executor = ContextCompat.getMainExecutor(context)
  private var provider: ProcessCameraProvider? = null
  private var preview: Preview? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var recording: Recording? = null
  private var currentPath = ""
  private var currentLensFacing = CameraSelector.LENS_FACING_BACK
  private var paused = false
  private var startedAtUs = 0L
  private var startedAtMs = 0L
  private var released = false
  private var streamObserver: Observer<PreviewView.StreamState>? = null

  init {
    previewView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    previewView.scaleType = PreviewView.ScaleType.FILL_CENTER
    addView(previewView)
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (released) return@addListener
      provider = future.get()
      bindCamera()
    }, mainExecutor)
  }

  fun setLensFacing(value: String?) {
    val next = if (value == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
    if (next == currentLensFacing) return
    if (recording != null) {
      emit("error", 0, 0, "CANNOT_SWITCH_DURING_RECORDING")
      return
    }
    currentLensFacing = next
    bindCamera()
  }

  private fun bindCamera() {
    val cameraProvider = provider ?: return
    val owner = (context as? com.facebook.react.uimanager.ThemedReactContext)?.currentActivity as? LifecycleOwner
    if (owner == null) {
      emit("error", 0, 0, "NO_LIFECYCLE")
      return
    }
    if (context.checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      emit("error", 0, 0, "CAMERA_PERMISSION_REQUIRED")
      return
    }
    try {
      cameraProvider.unbindAll()
      val nextPreview = Preview.Builder().build().also {
        it.setSurfaceProvider(previewView.surfaceProvider)
      }
      val recorder = Recorder.Builder()
        .setQualitySelector(QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
        .build()
      val nextVideo = VideoCapture.withOutput(recorder)
      val selector = CameraSelector.Builder().requireLensFacing(currentLensFacing).build()
      cameraProvider.bindToLifecycle(owner, selector, nextPreview, nextVideo)
      preview = nextPreview
      videoCapture = nextVideo
      streamObserver?.let { previewView.previewStreamState.removeObserver(it) }
      val observer = Observer<PreviewView.StreamState> { state ->
        if (state == PreviewView.StreamState.STREAMING) {
          val size = nextVideo.resolutionInfo?.resolution
          emit("playing", size?.width ?: 0, size?.height ?: 0, "")
        }
      }
      streamObserver = observer
      previewView.previewStreamState.observe(owner, observer)
      val w = nextVideo.resolutionInfo?.resolution?.width ?: 1280
      val h = nextVideo.resolutionInfo?.resolution?.height ?: 720
      emit("preparing", w, h, "")
      if (currentPath.isNotEmpty()) startRecording(currentPath)
    } catch (e: Exception) {
      emit("error", 0, 0, e.javaClass.simpleName + ": " + (e.message ?: "CAMERA_BIND_FAILED"))
    }
  }

  fun setRecordingPath(path: String?) {
    val next = path.orEmpty()
    if (next == currentPath) return
    currentPath = next
    if (next.isEmpty()) {
      stopRecording()
    } else if (videoCapture != null) {
      startRecording(next)
    }
  }

  fun setRecordingPaused(value: Boolean) {
    if (paused == value) return
    paused = value
    val active = recording ?: return
    try {
      if (value) active.pause() else active.resume()
    } catch (e: Exception) {
      emit("error", 0, 0, "RECORDING_PAUSE_FAILED")
    }
  }

  private fun startRecording(path: String) {
    if (recording != null) return
    val capture = videoCapture ?: return
    val target = File(path)
    val sessionsRoot = File(context.filesDir, "sessions").canonicalFile
    val canonical = target.canonicalFile
    if (!canonical.path.startsWith(sessionsRoot.path + File.separator)) {
      emit("recorded", 0, 0, JSONObject().put("ok", false).put("error", "BAD_PATH").toString())
      return
    }
    try {
      target.parentFile?.mkdirs()
      startedAtUs = 0L
      startedAtMs = System.currentTimeMillis()
      val options = FileOutputOptions.Builder(target).build()
      recording = capture.output.prepareRecording(context, options).start(mainExecutor) { event ->
        when (event) {
          is VideoRecordEvent.Start -> {
            startedAtUs = System.nanoTime() / 1000L
            emit("recording", capture.resolutionInfo?.resolution?.width ?: 0, capture.resolutionInfo?.resolution?.height ?: 0, "")
            if (paused) recording?.pause()
          }
          is VideoRecordEvent.Finalize -> {
            recording = null
            val json = JSONObject()
            val ok = !event.hasError() && target.exists() && target.length() > 0L
            if (!ok) target.delete()
            val retriever = MediaMetadataRetriever()
            var width = capture.resolutionInfo?.resolution?.width ?: 0
            var height = capture.resolutionInfo?.resolution?.height ?: 0
            var durationMs = event.recordingStats.recordedDurationNanos / 1_000_000L
            try {
              retriever.setDataSource(target.absolutePath)
              width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: width
              height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: height
              durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: durationMs
            } catch (_: Exception) {
            } finally {
              try { retriever.release() } catch (_: Exception) {}
            }
            json.put("ok", ok)
            json.put("error", if (ok) "" else "CAMERA_RECORDING_" + event.error)
            json.put("path", if (ok) target.absolutePath else "")
            json.put("width", width)
            json.put("height", height)
            json.put("frames", 0)
            json.put("keyFrames", 0)
            json.put("bytes", if (ok) target.length() else 0L)
            json.put("mediaDurationMs", durationMs)
            json.put("wallMs", if (startedAtMs > 0) System.currentTimeMillis() - startedAtMs else 0L)
            json.put("waitedForKeyframeMs", 0)
            json.put("skippedBeforeStart", 0)
            json.put("nonMonotonic", 0)
            json.put("csdFromFormat", false)
            json.put("firstSampleUs", startedAtUs)
            json.put("source", if (currentLensFacing == CameraSelector.LENS_FACING_FRONT) "phone-front" else "phone-rear")
            emit("recorded", width, height, json.toString())
            currentPath = ""
            paused = false
          }
        }
      }
    } catch (e: Exception) {
      recording = null
      emit("recorded", 0, 0, JSONObject().put("ok", false).put("error", "CAMERA_START_FAILED").toString())
    }
  }

  private fun stopRecording() {
    try { recording?.stop() } catch (_: Exception) {}
  }

  fun release() {
    released = true
    stopRecording()
    streamObserver?.let { previewView.previewStreamState.removeObserver(it) }
    streamObserver = null
    try { provider?.unbindAll() } catch (_: Exception) {}
    provider = null
    preview = null
    videoCapture = null
  }

  private fun emit(state: String, width: Int, height: Int, message: String) {
    val reactContext = context as? ReactContext ?: return
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
    val payload = Arguments.createMap().apply {
      putString("state", state)
      putInt("width", width)
      putInt("height", height)
      putString("message", message)
    }
    dispatcher?.dispatchEvent(CameraStateEvent(UIManagerHelper.getSurfaceId(reactContext), id, payload))
  }

  inner class CameraStateEvent(surfaceId: Int, viewId: Int, private val payload: WritableMap) :
    Event<CameraStateEvent>(surfaceId, viewId) {
    override fun getEventName() = "onPlayerState"
    override fun getEventData() = payload
  }
}
