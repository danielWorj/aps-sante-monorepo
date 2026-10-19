package com.flutter.stripe.rnshim.react.uimanager

import com.flutter.stripe.rnshim.react.bridge.ReadableMap
import com.flutter.stripe.rnshim.react.uimanager.events.Event
import com.flutter.stripe.rnshim.react.uimanager.events.EventDispatcher
import com.flutter.stripe.rnshim.react.uimanager.events.RCTEventEmitter
import io.flutter.plugin.common.MethodChannel

class UIManagerModule(channel: MethodChannel) {

    private val rctInstance: RCTEventEmitter = RCTEventEmitter(channel)

    val eventDispatcher: EventDispatcher = object : EventDispatcher {
        override fun dispatchEvent(event: Event<*>) {
            event.dispatch(rctInstance)
        }

        override fun invoke(name: String, value: ReadableMap) {
            rctInstance.receiveEvent(name, name, value)
        }

        override fun invoke(name: String) {
            rctInstance.receiveEvent(name, name, null)
        }
    }
}
