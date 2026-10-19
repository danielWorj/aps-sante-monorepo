package com.flutter.stripe.rnshim.react.uimanager.events

import com.flutter.stripe.rnshim.react.bridge.ReadableMap

interface EventDispatcher {
    fun dispatchEvent(event: Event<*>)
    fun invoke(name: String, value: ReadableMap)
    fun invoke(name: String)
}
