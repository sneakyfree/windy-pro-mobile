# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ─── React Native Core ──────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ─── Hermes Engine ──────────────────────────────────────────────
# Prevents R8 from stripping the JS engine in release builds
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jsc.** { *; }

# ─── OkHttp (React Native networking) ───────────────────────────
# Prevents certificate pinning and networking failures in release
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ─── Expo Modules ───────────────────────────────────────────────
# Prevents stripping native bridges for expo-av, expo-camera, etc.
-keep class expo.modules.** { *; }
-keep class com.expo.** { *; }

# expo-av (audio recording + playback)
-keep class expo.modules.av.** { *; }

# expo-camera (OCR camera capture)
-keep class expo.modules.camera.** { *; }

# expo-notifications (FCM push)
-keep class expo.modules.notifications.** { *; }

# expo-file-system (translation audio temp files)
-keep class expo.modules.filesystem.** { *; }

# ─── AndroidX + Material ────────────────────────────────────────
-keep class androidx.** { *; }
-dontwarn androidx.**

# ─── Gson / JSON parsing ────────────────────────────────────────
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.google.gson.** { *; }

# ─── Windy Pro — Custom Native Modules ──────────────────────────
# Keep all custom Kotlin classes used by AndroidManifest and RN bridge
-keep class uk.thewindstorm.windypro.FloatingOverlayService { *; }
-keep class uk.thewindstorm.windypro.PasteAccessibilityService { *; }
-keep class uk.thewindstorm.windypro.WindyOverlayModule { *; }
-keep class uk.thewindstorm.windypro.WindyOverlayPackage { *; }
-keep class uk.thewindstorm.windypro.OverlayPermissionHelper { *; }
-keep class uk.thewindstorm.windypro.MainActivity { *; }
-keep class uk.thewindstorm.windypro.MainApplication { *; }
