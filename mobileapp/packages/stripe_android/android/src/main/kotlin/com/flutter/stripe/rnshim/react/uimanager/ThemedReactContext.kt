package com.flutter.stripe.rnshim.react.uimanager

import android.content.Context
import android.content.ContextWrapper
import com.flutter.stripe.rnshim.react.bridge.ReactApplicationContext
import com.flutter.stripe.rnshim.react.bridge.ReactContext
import com.reactnativestripesdk.StripeSdkModule
import io.flutter.plugin.common.MethodChannel

class ThemedReactContext(
    context: ReactApplicationContext,
    channel: MethodChannel,
    sdkAccessor: () -> StripeSdkModule
) : ReactContext(
    context.currentActivity,
    channel = channel,
    sdkAccessor = sdkAccessor
) {
    val surfaceId: Int = 0
}