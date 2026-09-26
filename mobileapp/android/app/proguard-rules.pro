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