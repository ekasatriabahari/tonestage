package com.tonestage.app.session

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class SessionsPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == SessionsModule.NAME) {
        SessionsModule(reactContext)
      } else {
        null
      }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
        SessionsModule.NAME to
            ReactModuleInfo(
                name = SessionsModule.NAME,
                className = SessionsModule.NAME,
                canOverrideExistingModule = false,
                needsEagerInit = false,
                isCxxModule = false,
                isTurboModule = true,
            )
    )
  }
}