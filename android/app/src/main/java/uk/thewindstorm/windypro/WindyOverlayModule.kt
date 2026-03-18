/**
 * 🧬 M4.3 — Windy Overlay Native Module
 * React Native bridge for the floating tornado overlay.
 *
 * @ReactMethod:
 *   hasOverlayPermission()     — Check SYSTEM_ALERT_WINDOW (Promise<boolean>)
 *   requestOverlayPermission() — Open overlay settings, resolve on return (Promise<boolean>)
 *   startOverlay()             — Start the floating overlay service (Promise)
 *   stopOverlay()              — Stop the floating overlay service (Promise)
 *   isOverlayActive()          — Check if overlay is currently running (Promise<boolean>)
 *   checkPermissions()         — Check all permissions map (Promise<Map>)
 *   pasteText(text)            — Paste text via AccessibilityService (Promise)
 *   setOverlayState(state)     — Update overlay visual state (Promise)
 *   openAccessibilitySettings()— Open accessibility settings
 *
 * Events emitted to JS:
 *   onOverlayRecord — { action: "start" | "stop" }
 */
package uk.thewindstorm.windypro

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class WindyOverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val OVERLAY_PERMISSION_REQUEST_CODE = 5469
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

    // Promise saved while waiting for overlay permission settings to return
    private var overlayPermissionPromise: Promise? = null

    override fun getName(): String = "WindyOverlay"

    override fun initialize() {
        super.initialize()
        moduleInstance = this
        reactContext.addActivityEventListener(this)
    }

    override fun invalidate() {
        moduleInstance = null
        reactContext.removeActivityEventListener(this)
        super.invalidate()
    }

    // ─── ActivityEventListener ────────────────────────────────────

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == OVERLAY_PERMISSION_REQUEST_CODE) {
            val granted = Settings.canDrawOverlays(reactContext)
            overlayPermissionPromise?.resolve(granted)
            overlayPermissionPromise = null
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // Not used
    }

    // ─── React Methods ───────────────────────────────────────────

    /**
     * Check if SYSTEM_ALERT_WINDOW permission is granted.
     */
    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactContext))
    }

    /**
     * Request SYSTEM_ALERT_WINDOW permission.
     * Opens the system overlay settings screen. Resolves with true/false
     * when the user returns to the app.
     */
    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        // Already granted — resolve immediately
        if (Settings.canDrawOverlays(reactContext)) {
            promise.resolve(true)
            return
        }

        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactContext.packageName}")
        )

        val activity = currentActivity
        if (activity != null) {
            // Use startActivityForResult so we get onActivityResult when user returns
            overlayPermissionPromise = promise
            activity.startActivityForResult(intent, OVERLAY_PERMISSION_REQUEST_CODE)
        } else {
            // No activity — fire-and-forget
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(false)
        }
    }

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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
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

    /**
     * Paste text at the current cursor position via AccessibilityService.
     * Falls back to clipboard-only if accessibility is not enabled.
     */
    @ReactMethod
    fun pasteText(text: String, promise: Promise) {
        try {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                val service = PasteAccessibilityService.instance
                if (service != null) {
                    service.pasteTranscript(text)
                } else {
                    // Fallback: copy to clipboard
                    try {
                        val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("Windy Pro Transcript", text))
                    } catch (e: Exception) {
                        android.util.Log.w("WindyOverlay", "Clipboard fallback failed", e)
                    }
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PASTE_FAILED", e.message)
        }
    }

    /**
     * Update the overlay button's visual state (idle/recording/processing/error).
     * Sends an intent to FloatingOverlayService to change its appearance.
     */
    @ReactMethod
    fun setOverlayState(state: String, promise: Promise) {
        try {
            if (!FloatingOverlayService.isRunning) {
                promise.resolve(false)
                return
            }
            val intent = Intent(reactContext, FloatingOverlayService::class.java)
            intent.action = FloatingOverlayService.ACTION_SET_STATE
            intent.putExtra("overlay_state", state)
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_STATE_FAILED", e.message)
        }
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
        android.os.Handler(android.os.Looper.getMainLooper()).post {
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
