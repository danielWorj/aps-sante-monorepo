# Fix R8 "missing class" pour kotlinx.parcelize (via Giphy SDK embarqué par jitsi_meet_flutter_sdk)
-dontwarn kotlinx.parcelize.Parcelize
-dontwarn kotlinx.parcelize.**

# Règles usuelles Jitsi / WebRTC / Giphy pour éviter des crashs au runtime en release
-keep class org.jitsi.** { *; }
-keep class com.giphy.sdk.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn org.jitsi.**
-dontwarn com.giphy.sdk.**
-dontwarn org.webrtc.**

# React Native embarqué par le SDK Jitsi : chargé par réflexion / JNI
# (modules natifs, Hermes, SoLoader) — R8 ne doit rien renommer ni retirer.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
-keep class com.swmansion.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn com.facebook.react.**

# Stripe (flutter_stripe)
-dontwarn com.stripe.android.pushProvisioning.**
-dontwarn com.google.android.gms.tapandpay.**
-keep class com.stripe.** { *; }