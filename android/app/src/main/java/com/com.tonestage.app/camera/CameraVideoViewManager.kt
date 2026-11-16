package com.tonestage.app.camera

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.CameraVideoViewManagerDelegate
import com.facebook.react.viewmanagers.CameraVideoViewManagerInterface

class CameraVideoViewManager :
  SimpleViewManager<CameraVideoView>(), CameraVideoViewManagerInterface<CameraVideoView> {

  private val delegate: ViewManagerDelegate<CameraVideoView> = CameraVideoViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<CameraVideoView> = delegate
  override fun getName(): String = REACT_CLASS
  override fun createViewInstance(context: ThemedReactContext) = CameraVideoView(context)

  @ReactProp(name = "lensFacing")
  override fun setLensFacing(view: CameraVideoView, value: String?) = view.setLensFacing(value)

  @ReactProp(name = "recordingPath")
  override fun setRecordingPath(view: CameraVideoView, value: String?) = view.setRecordingPath(value)

  @ReactProp(name = "recordingPaused", defaultBoolean = false)
  override fun setRecordingPaused(view: CameraVideoView, value: Boolean) = view.setRecordingPaused(value)

  override fun onDropViewInstance(view: CameraVideoView) {
    view.release()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> =
    mapOf("onPlayerState" to mapOf("phasedRegistrationNames" to mapOf("bubbled" to "onPlayerState", "captured" to "onPlayerStateCapture")))

  companion object { const val REACT_CLASS = "CameraVideoView" }
}
