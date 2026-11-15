package com.tonestage.app.camera

import android.content.Context
import android.media.MediaMetadataRetriever
import android.util.Log
import android.view.OrientationEventListener
import android.view.Surface
import android.graphics.Matrix
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.view.TextureView
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.MirrorMode
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
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
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
  private val previewTexture = TextureView(context)
  private val mainExecutor: Executor = ContextCompat.getMainExecutor(context)
  private var pendingSurfaceRequest: androidx.camera.core.SurfaceRequest? = null
  private var activePreviewSurface: Surface? = null
  private var previewFrameReceived = false
  private var previewRotationDegrees = 0
  private var previewCropRect: RectF? = null
  private val orientationListener = object : OrientationEventListener(context) {
    override fun onOrientationChanged(orientation: Int) {
      if (orientation == ORIENTATION_UNKNOWN) return
      val rotation = when (orientation) {
        in 45..134 -> Surface.ROTATION_270
        in 135..224 -> Surface.ROTATION_180
        in 225..314 -> Surface.ROTATION_90
        else -> Surface.ROTATION_0
      }
      preview?.targetRotation = rotation
      videoCapture?.targetRotation = rotation
    }
  }
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
  private var cameraBound = false

  init {
    previewTexture.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    previewTexture.isOpaque = true
    previewTexture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
        Log.d(TAG, "TextureView surface available=${width}x${height}")
        providePendingSurface()
      }
      override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
        Log.d(TAG, "TextureView surface size=${width}x${height}")
        providePendingSurface()
      }
      override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        Log.d(TAG, "TextureView surface destroyed")
        pendingSurfaceRequest = null
        activePreviewSurface?.release()
        activePreviewSurface = null
        return true
      }
      override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {
        if (!previewFrameReceived) {
          previewFrameReceived = true
          Log.d(TAG, "TextureView first preview frame received")
          emit("playing", 1280, 720, "")
        }
      }
    }
    addView(previewTexture)
    addOnLayoutChangeListener { _, left, top, right, bottom, _, _, _, _ ->
      Log.d(TAG, "container layout=${right - left}x${bottom - top} attached=$isAttachedToWindow laidOut=$isLaidOut")
    }
    previewTexture.addOnLayoutChangeListener { _, left, top, right, bottom, _, _, _, _ ->
      Log.d(TAG, "TextureView layout=${right - left}x${bottom - top} available=${previewTexture.isAvailable}")
      applyPreviewTransform()
      providePendingSurface()
    }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (released) return@addListener
      provider = future.get()
      if (isAttachedToWindow) bindCamera(includeVideoCapture = currentPath.isNotEmpty())
    }, mainExecutor)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    Log.d(TAG, "onAttached width=$width height=$height texture=${previewTexture.width}x${previewTexture.height} available=${previewTexture.isAvailable} laidOut=$isLaidOut")
    orientationListener.enable()
    // The React Activity/lifecycle owner may not be available during view construction.
    if (!cameraBound && provider != null) post { bindCamera(includeVideoCapture = currentPath.isNotEmpty()) }
  }

  override fun onDetachedFromWindow() {
    orientationListener.disable()
    super.onDetachedFromWindow()
  }

  fun setLensFacing(value: String?) {
    val next = if (value == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
    if (next == currentLensFacing) {
      if (!cameraBound && isAttachedToWindow) bindCamera()
      return
    }
    if (recording != null) {
      emit("error", 0, 0, "CANNOT_SWITCH_DURING_RECORDING")
      return
    }
    currentLensFacing = next
    bindCamera()
  }

  private fun bindCamera(includeVideoCapture: Boolean = false) {
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
      Log.d(TAG, "bindCamera start lens=$currentLensFacing includeVideoCapture=$includeVideoCapture texture=${previewTexture.width}x${previewTexture.height} available=${previewTexture.isAvailable}")
      pendingSurfaceRequest?.willNotProvideSurface()
      pendingSurfaceRequest = null
      cameraProvider.unbindAll()
      cameraBound = false
      val rotation = previewTexture.display?.rotation ?: Surface.ROTATION_0
      val nextPreview = Preview.Builder().setTargetRotation(rotation).build().also { useCase ->
        useCase.setSurfaceProvider(mainExecutor) { request ->
          Log.d(TAG, "SurfaceProvider request resolution=${request.resolution} texture=${previewTexture.width}x${previewTexture.height} available=${previewTexture.isAvailable}")
          request.setTransformationInfoListener(mainExecutor) { info ->
            previewRotationDegrees = info.rotationDegrees
            previewCropRect = RectF(info.cropRect)
            applyPreviewTransform()
            Log.d(TAG, "preview transform rotation=${info.rotationDegrees} crop=${info.cropRect}")
          }
          pendingSurfaceRequest = request
          providePendingSurface()
        }
      }
      val nextVideo = if (includeVideoCapture) {
        val recorder = Recorder.Builder()
          .setQualitySelector(QualitySelector.from(Quality.SD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
          .build()
        VideoCapture.Builder(recorder)
          .setTargetRotation(rotation)
          .setMirrorMode(MirrorMode.MIRROR_MODE_ON_FRONT_ONLY)
          .build()
      } else null
      val selector = CameraSelector.Builder().requireLensFacing(currentLensFacing).build()
      if (nextVideo != null) cameraProvider.bindToLifecycle(owner, selector, nextPreview, nextVideo)
      else cameraProvider.bindToLifecycle(owner, selector, nextPreview)
      cameraBound = true
      preview = nextPreview
      videoCapture = nextVideo
      emit("preparing", 1280, 720, "")
      if (includeVideoCapture && currentPath.isNotEmpty()) startRecording(currentPath)
    } catch (e: Exception) {
      Log.e(TAG, "bindCamera failed", e)
      cameraBound = false
      emit("error", 0, 0, e.javaClass.simpleName + ": " + (e.message ?: "CAMERA_BIND_FAILED"))
    }
  }

  /**
   * Match CameraX's buffer orientation to the current preview container.
   * TextureView otherwise stretches the camera buffer to the view bounds.
   */
  private fun applyPreviewTransform() {
    val viewWidth = previewTexture.width.toFloat()
    val viewHeight = previewTexture.height.toFloat()
    if (viewWidth <= 0f || viewHeight <= 0f || !previewTexture.isAvailable) return

    val bufferWidth = previewTexture.surfaceTexture?.let { preview ->
      // SurfaceTexture buffer size is the CameraX output resolution.
      previewCropRect?.width()?.takeIf { it > 0f } ?: viewWidth
    } ?: return
    val bufferHeight = previewCropRect?.height()?.takeIf { it > 0f } ?: viewHeight
    val crop = previewCropRect ?: RectF(0f, 0f, bufferWidth, bufferHeight)
    val matrix = Matrix()
    matrix.setRotate(previewRotationDegrees.toFloat(), crop.centerX(), crop.centerY())

    val rotatedCrop = RectF(crop)
    matrix.mapRect(rotatedCrop)
    val scale = maxOf(viewWidth / rotatedCrop.width(), viewHeight / rotatedCrop.height())
    matrix.postScale(scale, scale)
    matrix.postTranslate(
      viewWidth / 2f - rotatedCrop.centerX() * scale,
      viewHeight / 2f - rotatedCrop.centerY() * scale
    )
    previewTexture.setTransform(matrix)
  }

  /** Provide CameraX a Surface backed directly by TextureView. */
  private fun providePendingSurface() {
    val request = pendingSurfaceRequest ?: return
    if (!previewTexture.isAvailable || previewTexture.width <= 0 || previewTexture.height <= 0) {
      Log.d(TAG, "SurfaceRequest waiting for TextureView availability")
      return
    }
    if (released || !isAttachedToWindow) {
      pendingSurfaceRequest = null
      request.willNotProvideSurface()
      return
    }
    pendingSurfaceRequest = null
    val texture = previewTexture.surfaceTexture ?: run {
      pendingSurfaceRequest = request
      return
    }
    val resolution = request.resolution
    try {
      texture.setDefaultBufferSize(resolution.width, resolution.height)
      previewFrameReceived = false
      if (previewCropRect == null) previewCropRect = RectF(0f, 0f, resolution.width.toFloat(), resolution.height.toFloat())
      applyPreviewTransform()
      val surface = Surface(texture)
      activePreviewSurface = surface
      Log.d(TAG, "provideSurface resolution=${resolution.width}x${resolution.height}")
      request.provideSurface(surface, mainExecutor) { result ->
        Log.d(TAG, "provideSurface result=${result.resultCode}")
        if (activePreviewSurface === surface) activePreviewSurface = null
        surface.release()
        if (result.resultCode != androidx.camera.core.SurfaceRequest.Result.RESULT_SURFACE_USED_SUCCESSFULLY && !released) {
          emit("preparing", 1280, 720, "PREVIEW_SURFACE_RESULT_${result.resultCode}")
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "provideSurface failed", e)
      activePreviewSurface?.release()
      activePreviewSurface = null
      emit("error", 0, 0, "PREVIEW_SURFACE_FAILED: ${e.message ?: e.javaClass.simpleName}")
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
    } else {
      bindCamera(includeVideoCapture = true)
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
            emit("recording", 1280, 720, "")
            if (paused) recording?.pause()
          }
          is VideoRecordEvent.Finalize -> {
            recording = null
            val json = JSONObject()
            val ok = !event.hasError() && target.exists() && target.length() > 0L
            if (!ok) target.delete()
            val retriever = MediaMetadataRetriever()
            var width = 1280
            var height = 720
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
            // Release the encoder use case after each take; leave a preview-only
            // session running so preview remains available between recordings.
            post {
              if (!released && currentPath.isEmpty()) bindCamera(includeVideoCapture = false)
            }
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
    orientationListener.disable()
    stopRecording()
    try { provider?.unbindAll() } catch (_: Exception) {}
    pendingSurfaceRequest?.willNotProvideSurface()
    pendingSurfaceRequest = null
    activePreviewSurface?.release()
    activePreviewSurface = null
    provider = null
    cameraBound = false
    preview = null
    videoCapture = null
  }

  companion object {
    private const val TAG = "ToneStageCameraSurface"
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
