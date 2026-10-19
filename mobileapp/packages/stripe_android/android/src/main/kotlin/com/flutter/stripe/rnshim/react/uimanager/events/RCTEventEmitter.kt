package com.flutter.stripe.rnshim.react.uimanager.events

import com.flutter.stripe.rnshim.react.bridge.ReadableMap
import com.flutter.stripe.rnshim.react.bridge.WritableMap
import io.flutter.plugin.common.MethodChannel

class RCTEventEmitter(private val channel: MethodChannel) {

    fun receiveEvent(viewTag: Any, eventName: String, serializeEventData: ReadableMap?) {
        channel.invokeMethod(eventName, serializeEventData)
    }
}
