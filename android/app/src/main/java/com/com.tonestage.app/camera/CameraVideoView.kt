package com.tonestage.app.camera

import android.content.Context
import android.media.MediaMetadataRetriever
import android.graphics.Matrix
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.util.Log
import android.view.Surface
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
  private var previewMirroring = false
  private var previewCropRect: RectF? = null
  private var previewResolution: android.util.Size? = null
  private var previewTargetRotation = Surface.ROTATION_0
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
        applyPreviewTransform()
        providePendingSurface()
      }
      override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
        Log.d(TAG, "TextureView surface destroyed")
        pendingSurfaceRequest?.willNotProvideSurface()
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
    previewTexture.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      applyPreviewTransform()
      providePendingSurface()
    }
    addOnLayoutChangeListener { _, left, top, right, bottom, _, _, _, _ ->
      Log.d(TAG, "container layout=${right - left}x${bottom - top} attached=$isAttachedToWindow laidOut=$isLaidOut")
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
    // The React Activity/lifecycle owner may not be available during view construction.
    if (!cameraBound && provider != null) post { bindCamera(includeVideoCapture = currentPath.isNotEmpty()) }
  }

  override fun onDetachedFromWindow() {
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
      previewCropRect = null
      previewRotationDegrees = 0
      previewMirroring = false
      previewResolution = null
      previewTargetRotation = Surface.ROTATION_0
      previewTexture.scaleX = 1f
      previewTexture.scaleY = 1f
      previewTexture.translationX = 0f
      previewTexture.translationY = 0f
      previewTexture.setTransform(Matrix())
      previewFrameReceived = false
      cameraProvider.unbindAll()
      cameraBound = false
      val rotation = previewTexture.display?.rotation ?: Surface.ROTATION_0
      previewTargetRotation = rotation
      val nextPreview = Preview.Builder().setTargetRotation(rotation).build().also { useCase ->
        useCase.setSurfaceProvider(mainExecutor) { request ->
          Log.d(TAG, "SurfaceProvider request resolution=${request.resolution} texture=${previewTexture.width}x${previewTexture.height} available=${previewTexture.isAvailable}")
          previewResolution = request.resolution
          request.setTransformationInfoListener(mainExecutor) { info ->
            // CameraX reports the clockwise correction needed for the target
            // display. TextureView's transform uses the opposite sign to
            // orient the raw SurfaceTexture buffer in view coordinates.
            previewRotationDegrees = info.rotationDegrees
            previewTargetRotation = info.targetRotation
            previewMirroring = info.isMirroring
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
   * Port of CameraX PreviewTransformation for a custom TextureView surface.
   *
   * TextureView.setTransform only corrects display rotation. CameraX's
   * rotationDegrees/cropRect are applied to the TextureView's view geometry,
   * not directly as a buffer-pixel matrix. Front-camera mirroring also changes
   * axis when the upright output is rotated by 90/270 degrees.
   */
  private fun applyPreviewTransform() {
    val viewWidth = previewTexture.width.toFloat()
    val viewHeight = previewTexture.height.toFloat()
    val resolution = previewResolution ?: return
    val crop = previewCropRect ?: return
    if (!previewTexture.isAvailable || viewWidth <= 0f || viewHeight <= 0f) return
    if (resolution.width <= 0 || resolution.height <= 0 || crop.width() <= 0f || crop.height() <= 0f) return

    val targetRotationDegrees = when (previewTargetRotation) {
      Surface.ROTATION_90 -> 90f
      Surface.ROTATION_180 -> 180f
      Surface.ROTATION_270 -> 270f
      else -> 0f
    }

    // TextureView does not account for display rotation itself. Apply only
    // the inverse target-display rotation here (not sensor rotationDegrees).
    val surfaceRect = RectF(0f, 0f, resolution.width.toFloat(), resolution.height.toFloat())
    val textureCorrection = Matrix()
    if (targetRotationDegrees != 0f) {
      val correctionRotation = Matrix().apply {
        setRotate(-targetRotationDegrees, surfaceRect.centerX(), surfaceRect.centerY())
      }
      val correctedBounds = RectF(surfaceRect)
      correctionRotation.mapRect(correctedBounds)
      val correctionScale = maxOf(
        surfaceRect.width() / correctedBounds.width(),
        surfaceRect.height() / correctedBounds.height()
      )
      val correctionFit = Matrix().apply {
        setValues(floatArrayOf(
          correctionScale, 0f, surfaceRect.centerX() - correctedBounds.centerX() * correctionScale,
          0f, correctionScale, surfaceRect.centerY() - correctedBounds.centerY() * correctionScale,
          0f, 0f, 1f
        ))
      }
      textureCorrection.setConcat(correctionFit, correctionRotation)
    }
    previewTexture.setTransform(textureCorrection)

    // Map CameraX's cropped surface into the view using FILL_CENTER.
    val rotation = previewRotationDegrees.toFloat()
    val rotate = Matrix().apply {
      setRotate(rotation, crop.centerX(), crop.centerY())
    }
    val rotatedCrop = RectF(crop)
    rotate.mapRect(rotatedCrop)
    if (rotatedCrop.width() <= 0f || rotatedCrop.height() <= 0f) return

    val scale = maxOf(viewWidth / rotatedCrop.width(), viewHeight / rotatedCrop.height())
    val destination = RectF(
      viewWidth / 2f - rotatedCrop.width() * scale / 2f,
      viewHeight / 2f - rotatedCrop.height() * scale / 2f,
      viewWidth / 2f + rotatedCrop.width() * scale / 2f,
      viewHeight / 2f + rotatedCrop.height() * scale / 2f
    )
    val fit = Matrix().apply {
      setValues(floatArrayOf(
        scale, 0f, destination.left - rotatedCrop.left * scale,
        0f, scale, destination.top - rotatedCrop.top * scale,
        0f, 0f, 1f
      ))
    }
    val surfaceToView = Matrix().apply { setConcat(fit, rotate) }

    // CameraX mirrors front-camera output in the Surface. Compensate in the
    // source coordinate system: vertical flip for 90/270, horizontal for 0/180.
    if (previewMirroring) {
      val mirror = Matrix().apply {
        if (rotation.toInt() % 180 != 0) {
          setScale(1f, -1f, crop.centerX(), crop.centerY())
        } else {
          setScale(-1f, 1f, crop.centerX(), crop.centerY())
        }
      }
      val mirroredSurfaceToView = Matrix()
      mirroredSurfaceToView.setConcat(surfaceToView, mirror)
      surfaceToView.set(mirroredSurfaceToView)
    }

    // Apply the crop/rotation as View geometry, separate from TextureView's
    // display correction, matching CameraX PreviewTransformation.
    val transformedSurface = RectF(surfaceRect)
    surfaceToView.mapRect(transformedSurface)
    previewTexture.pivotX = 0f
    previewTexture.pivotY = 0f
    previewTexture.scaleX = transformedSurface.width() / viewWidth
    previewTexture.scaleY = transformedSurface.height() / viewHeight
    previewTexture.translationX = transformedSurface.left - previewTexture.left
    previewTexture.translationY = transformedSurface.top - previewTexture.top

    Log.d(TAG, "applied preview matrix lens=$currentLensFacing rotationDegrees=$previewRotationDegrees targetRotation=$previewTargetRotation mirrored=$previewMirroring surface=${resolution.width}x${resolution.height} crop=${crop.width()}x${crop.height()} view=${viewWidth}x${viewHeight} mapped=${transformedSurface.width()}x${transformedSurface.height()} offset=${transformedSurface.left},${transformedSurface.top}")
  }

  /** Fulfil CameraX's SurfaceRequest using the TextureView SurfaceTexture. */
  private fun providePendingSurface() {
    val request = pendingSurfaceRequest ?: return
    if (!previewTexture.isAvailable || previewTexture.width <= 0 || previewTexture.height <= 0) return
    if (released || !isAttachedToWindow) {
      pendingSurfaceRequest = null
      request.willNotProvideSurface()
      return
    }
    val texture = previewTexture.surfaceTexture ?: return
    pendingSurfaceRequest = null
    val resolution = request.resolution
    try {
      texture.setDefaultBufferSize(resolution.width, resolution.height)
      previewResolution = resolution
      previewFrameReceived = false
      if (previewCropRect == null) {
        previewCropRect = RectF(0f, 0f, resolution.width.toFloat(), resolution.height.toFloat())
      }
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
    stopRecording()
    pendingSurfaceRequest?.willNotProvideSurface()
    pendingSurfaceRequest = null
    activePreviewSurface?.release()
    activePreviewSurface = null
    try { provider?.unbindAll() } catch (_: Exception) {}
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
