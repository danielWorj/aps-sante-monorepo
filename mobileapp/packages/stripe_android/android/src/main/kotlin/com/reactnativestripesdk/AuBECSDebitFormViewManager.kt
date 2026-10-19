package com.reactnativestripesdk

import com.flutter.stripe.rnshim.react.bridge.Dynamic
import com.flutter.stripe.rnshim.react.module.annotations.ReactModule
import com.flutter.stripe.rnshim.react.uimanager.SimpleViewManager
import com.flutter.stripe.rnshim.react.uimanager.ThemedReactContext
import com.flutter.stripe.rnshim.react.uimanager.annotations.ReactProp
import com.flutter.stripe.rnshim.react.viewmanagers.AuBECSDebitFormManagerDelegate
import com.flutter.stripe.rnshim.react.viewmanagers.AuBECSDebitFormManagerInterface
import com.reactnativestripesdk.utils.asMapOrNull

@ReactModule(name = AuBECSDebitFormViewManager.REACT_CLASS)
class AuBECSDebitFormViewManager :
  SimpleViewManager<AuBECSDebitFormView>(),
  AuBECSDebitFormManagerInterface<AuBECSDebitFormView> {
  private val delegate = AuBECSDebitFormManagerDelegate(this)

  override fun getName() = REACT_CLASS

  override fun getDelegate() = delegate

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    mutableMapOf(
      FormCompleteEvent.EVENT_NAME to
        mutableMapOf("registrationName" to "onCompleteAction"),
    )

  @ReactProp(name = "companyName")
  override fun setCompanyName(
    view: AuBECSDebitFormView,
    name: String?,
  ) {
    view.setCompanyName(name)
  }

  @ReactProp(name = "formStyle")
  override fun setFormStyle(
    view: AuBECSDebitFormView,
    style: Dynamic,
  ) {
    view.setFormStyle(style.asMapOrNull())
  }

  override fun createViewInstance(reactContext: ThemedReactContext): AuBECSDebitFormView =
    AuBECSDebitFormView(reactContext)

  companion object {
    const val REACT_CLASS = "AuBECSDebitForm"
  }
}
