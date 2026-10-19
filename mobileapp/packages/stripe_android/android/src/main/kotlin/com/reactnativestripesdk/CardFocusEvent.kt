package com.reactnativestripesdk

import com.flutter.stripe.rnshim.react.bridge.Arguments
import com.flutter.stripe.rnshim.react.bridge.WritableMap
import com.flutter.stripe.rnshim.react.uimanager.events.Event

internal class CardFocusEvent(
  surfaceId: Int,
  viewTag: Int,
  private val focusField: String?,
) : Event<CardFocusEvent>(surfaceId, viewTag) {
  override fun getEventName() = EVENT_NAME

  override fun getEventData(): WritableMap? {
    val eventData = Arguments.createMap()
    eventData.putString("focusedField", focusField)

    return eventData
  }

  companion object {
    const val EVENT_NAME = "topFocusChange"
  }
}
