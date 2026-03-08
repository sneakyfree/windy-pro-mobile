/**
 * 🧬 M4.3 — Windy Overlay Native Module
 * React Native bridge for the floating tornado overlay.
 *
 * @ReactMethod:
 *   startOverlay()    — Start the floating overlay service
 *   stopOverlay()     — Stop the floating overlay service
 *   isOverlayActive() — Check if overlay is currently running (Promise)
 *   checkPermissions()— Check SYSTEM_ALERT_WINDOW permission (Promise)
 *
 * Events emitted to JS:
 *   onOverlayRecord — { action: "start" | "stop" }
 */
package uk.thewindstorm.windypro

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class WindyOverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private var moduleInstance: WindyOverlayModule? = null

        /**
         * Emit an event to the React Native JS side.
         * Called from FloatingOverlayService when recording state changes.
         */
        fun emitEvent(eventName: String, action: String) {
            val instance = moduleInstance ?: return
            val ctx = instance.reactContext
            if (!ctx.hasActiveReactInstance()) return

            try {
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, action)
            } catch (e: Exception) {
                android.util.Log.w("WindyOverlay", "emitEvent failed: $eventName", e)
            }
        }
    }

    override fun getName(): String = "WindyOverlayModule"

    override fun initialize() {
        super.initialize()
        moduleInstance = this
    }

    override fun invalidate() {
        moduleInstance = null
        super.invalidate()
    }

    // ─── React Methods ───────────────────────────────────────────

    @ReactMethod
    fun startOverlay(promise: Promise) {
        try {
            if (!Settings.canDrawOverlays(reactContext)) {
                promise.reject("PERMISSION_DENIED", "SYSTEM_ALERT_WINDOW permission not granted")
                return
            }

            // Save focused field if accessibility service is active
            PasteAccessibilityService.instance?.saveFocusedField()

            val intent = Intent(reactContext, FloatingOverlayService::class.java)
            reactContext.startForegroundService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_FAILED", e.message)
        }
    }

    @ReactMethod
    fun stopOverlay(promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingOverlayService::class.java)
            intent.action = FloatingOverlayService.ACTION_STOP
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message)
        }
    }

    @ReactMethod
    fun isOverlayActive(promise: Promise) {
        promise.resolve(FloatingOverlayService.isRunning)
    }

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        val result = Arguments.createMap().apply {
            putBoolean("canDrawOverlays", Settings.canDrawOverlays(reactContext))
            putBoolean("accessibilityEnabled", PasteAccessibilityService.isEnabled)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun requestOverlayPermission() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactContext.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
    }

    /**
     * Called from JS when transcription is complete.
     * Pastes the text at the previously focused cursor position.
     */
    @ReactMethod
    fun onTranscriptionResult(text: String) {
        // Notify FloatingOverlayService to update visuals
        // The service runs in the same process
        val services = reactContext.getSystemService(android.app.ActivityManager::class.java)
        // Just reset the overlay state
        // FloatingOverlayService is in the same process, we can reference companion
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            // Paste via accessibility if available
            PasteAccessibilityService.instance?.pasteTranscript(text)
        }
    }

    // Needed for RCTDeviceEventEmitter
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // Required for NativeEventEmitter
    }
}
