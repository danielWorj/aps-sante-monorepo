package com.reactnativestripesdk.pushprovisioning

import com.flutter.stripe.rnshim.react.bridge.Dynamic
import com.flutter.stripe.rnshim.react.bridge.ReadableMap
import com.flutter.stripe.rnshim.react.module.annotations.ReactModule
import com.flutter.stripe.rnshim.react.uimanager.SimpleViewManager
import com.flutter.stripe.rnshim.react.uimanager.ThemedReactContext
import com.flutter.stripe.rnshim.react.uimanager.annotations.ReactProp
import com.flutter.stripe.rnshim.react.viewmanagers.AddToWalletButtonManagerDelegate
import com.flutter.stripe.rnshim.react.viewmanagers.AddToWalletButtonManagerInterface
import com.reactnativestripesdk.utils.asMapOrNull

@ReactModule(name = AddToWalletButtonManager.REACT_CLASS)
class AddToWalletButtonManager :
  SimpleViewManager<AddToWalletButtonView>(),
  AddToWalletButtonManagerInterface<AddToWalletButtonView> {
  private val delegate = AddToWalletButtonManagerDelegate(this)

  override fun getName() = REACT_CLASS

  override fun getDelegate() = delegate

  override fun onDropViewInstance(view: AddToWalletButtonView) {
    view.onDropViewInstance()
    super.onDropViewInstance(view)
  }

  override fun onAfterUpdateTransaction(view: AddToWalletButtonView) {
    super.onAfterUpdateTransaction(view)
    view.onAfterUpdateTransaction()
  }

  override fun createViewInstance(reactContext: ThemedReactContext): AddToWalletButtonView =
    AddToWalletButtonView(reactContext)

  override fun getExportedCustomDirectEventTypeConstants() =
    mutableMapOf(
      AddToWalletCompleteEvent.EVENT_NAME to
        mutableMapOf("registrationName" to "onCompleteAction"),
    )

  @ReactProp(name = "androidAssetSource")
  override fun setAndroidAssetSource(
    view: AddToWalletButtonView,
    source: ReadableMap?,
  ) {
    view.setSourceMap(source)
  }

  @ReactProp(name = "cardDetails")
  override fun setCardDetails(
    view: AddToWalletButtonView,
    cardDetails: Dynamic,
  ) {
    view.setCardDetails(cardDetails.asMapOrNull())
  }

  @ReactProp(name = "ephemeralKey")
  override fun setEphemeralKey(
    view: AddToWalletButtonView,
    ephemeralKey: Dynamic,
  ) {
    val map = ephemeralKey.asMapOrNull()
    if (map == null) return
    view.setEphemeralKey(map)
  }

  @ReactProp(name = "token")
  override fun setToken(
    view: AddToWalletButtonView,
    token: Dynamic,
  ) {
    val map = token.asMapOrNull()
    if (map == null) return
    view.setToken(map)
  }

  @ReactProp(name = "iOSButtonStyle")
  override fun setIOSButtonStyle(
    view: AddToWalletButtonView,
    value: String?,
  ) {
    // noop, iOS only.
  }

  @ReactProp(name = "isBounceProvisioned")
  override fun setIsBounceProvisioned(
    view: AddToWalletButtonView,
    value: Boolean,
  ) {
    view.setIsBounceProvisioned(value)
  }

  @ReactProp(name = "testEnv")
  override fun setTestEnv(
    view: AddToWalletButtonView,
    value: Boolean,
  ) {
    // noop, iOS only.
  }

  companion object {
    const val REACT_CLASS = "AddToWalletButton"
  }
}
