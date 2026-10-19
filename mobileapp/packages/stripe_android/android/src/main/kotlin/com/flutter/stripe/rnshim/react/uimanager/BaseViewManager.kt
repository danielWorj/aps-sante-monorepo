package com.flutter.stripe.rnshim.react.uimanager

import android.view.View

open class BaseViewManager<T: View, Any> {
    open fun needsCustomLayoutForChildren(): Boolean {
        TODO("Not yet implemented")
    }
}