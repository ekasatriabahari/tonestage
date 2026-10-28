package com.tonestage.app.yi

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.YiVideoViewManagerDelegate
import com.facebook.react.viewmanagers.YiVideoViewManagerInterface

/** Connects the JS component "YiVideoView" (specs/YiVideoViewNativeComponent.ts) to [YiVideoView]. */
class YiVideoViewManager :
    SimpleViewManager<YiVideoView>(), YiVideoViewManagerInterface<YiVideoView> {

  private val delegate: YiVideoViewManagerDelegate<YiVideoView, YiVideoViewManager> =
      YiVideoViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<YiVideoView> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(context: ThemedReactContext): YiVideoView = YiVideoView(context)

  @ReactProp(name = "source")
  override fun setSource(view: YiVideoView, value: String?) {
    view.setSource(value)
  }

  @ReactProp(name = "recording")
  override fun setRecording(view: YiVideoView, value: Boolean) {
    view.setRecording(value)
  }

  override fun onDropViewInstance(view: YiVideoView) {
    view.release()
    super.onDropViewInstance(view)
  }

  override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> =
      mapOf(
          "onPlayerState" to
              mapOf(
                  "phasedRegistrationNames" to
                      mapOf("bubbled" to "onPlayerState", "captured" to "onPlayerStateCapture")))

  companion object {
    const val REACT_CLASS = "YiVideoView"
  }
}