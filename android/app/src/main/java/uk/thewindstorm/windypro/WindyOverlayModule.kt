package uk.thewindstorm.windypro

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class WindyOverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var tapReceiver: BroadcastReceiver? = null

    override fun getName(): String = "WindyOverlay"

    override fun initialize() {
        super.initialize()
        tapReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onOverlayTap", null)
            }
        }
        reactContext.registerReceiver(tapReceiver,
            IntentFilter("uk.thewindstorm.windypro.OVERLAY_TAP"),
            Context.RECEIVER_NOT_EXPORTED)
    }

    override fun onCatalystInstanceDestroy() {
        tapReceiver?.let { reactContext.unregisterReceiver(it) }
        super.onCatalystInstanceDestroy()
    }

    @ReactMethod fun hasOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) promise.resolve(Settings.canDrawOverlays(reactContext))
        else promise.resolve(true)
    }

    @ReactMethod fun requestOverlayPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
            reactContext.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}")).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
            promise.resolve(false)
        } else promise.resolve(true)
    }

    @ReactMethod fun startOverlay(promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingOverlayService::class.java).apply { action = FloatingOverlayService.ACTION_START }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(intent)
            else reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("OVERLAY_ERROR", e.message) }
    }

    @ReactMethod fun stopOverlay(promise: Promise) {
        try {
            reactContext.startService(Intent(reactContext, FloatingOverlayService::class.java)
                .apply { action = FloatingOverlayService.ACTION_STOP })
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("OVERLAY_ERROR", e.message) }
    }

    @ReactMethod fun isOverlayActive(promise: Promise) { promise.resolve(FloatingOverlayService.isActive) }

    @ReactMethod fun setOverlayState(state: String, promise: Promise) {
        try {
            reactContext.startService(Intent(reactContext, FloatingOverlayService::class.java)
                .apply { action = FloatingOverlayService.ACTION_UPDATE_STATE; putExtra(FloatingOverlayService.EXTRA_STATE, state) })
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("OVERLAY_ERROR", e.message) }
    }

    @ReactMethod fun hasAccessibilityPermission(promise: Promise) {
        promise.resolve(OverlayPermissionHelper.isAccessibilityServiceEnabled(reactContext))
    }

    @ReactMethod fun requestAccessibilityPermission(promise: Promise) {
        OverlayPermissionHelper.requestAccessibilityPermission(reactContext)
        promise.resolve(true)
    }

    @ReactMethod fun getPermissionStatus(promise: Promise) {
        val status = OverlayPermissionHelper.getPermissionStatus(reactContext)
        val map = Arguments.createMap()
        status.forEach { (key, value) -> map.putBoolean(key, value) }
        promise.resolve(map)
    }

    @ReactMethod fun isFullyOperational(promise: Promise) {
        promise.resolve(OverlayPermissionHelper.isFullyOperational(reactContext))
    }

    @ReactMethod fun pasteText(text: String, promise: Promise) {
        try { PasteAccessibilityService.pasteText(text); promise.resolve(true) }
        catch (e: Exception) { promise.reject("PASTE_ERROR", e.message) }
    }
}
