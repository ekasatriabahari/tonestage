package com.tonestage.app.yi

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/** Registers the Yi control module (TurboModule) and the live video view (Fabric component). */
class YiControlPackage : BaseReactPackage() {

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
      listOf(YiVideoViewManager())

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == YiControlModule.NAME) {
        YiControlModule(reactContext)
      } else {
        null
      }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        YiControlModule.NAME to
            ReactModuleInfo(
                name = YiControlModule.NAME,
                className = YiControlModule.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            )
    )
  }
}