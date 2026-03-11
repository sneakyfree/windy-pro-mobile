package uk.thewindstorm.windypro

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager

/**
 * 🧬 M4 — Overlay Permission Helper
 * Manages SYSTEM_ALERT_WINDOW and Accessibility Service permissions
 */
object OverlayPermissionHelper {

    /**
     * Check if overlay permission is granted
     */
    fun hasOverlayPermission(context: Context): Boolean {
        return Settings.canDrawOverlays(context)
    }

    /**
     * Open system settings to request overlay permission
     */
    fun requestOverlayPermission(context: Context) {
        if (!Settings.canDrawOverlays(context)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
    }

    /**
     * Check if accessibility service is enabled
     */
    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
        val componentName = "${context.packageName}/.PasteAccessibilityService"
        return enabledServices.any { it.resolveInfo?.serviceInfo?.let { info ->
            "${info.packageName}/.${info.name.substringAfterLast('.')}" == componentName ||
            info.name == "uk.thewindstorm.windypro.PasteAccessibilityService"
        } ?: false }
    }

    /**
     * Open accessibility settings for user to enable the service
     */
    fun requestAccessibilityPermission(context: Context) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /**
     * Check all required permissions for overlay functionality
     */
    fun getPermissionStatus(context: Context): Map<String, Boolean> {
        return mapOf(
            "overlay" to hasOverlayPermission(context),
            "accessibility" to isAccessibilityServiceEnabled(context),
            "notification" to true // Always granted for foreground services
        )
    }

    /**
     * Check if all overlay features are fully operational
     */
    fun isFullyOperational(context: Context): Boolean {
        return hasOverlayPermission(context) && isAccessibilityServiceEnabled(context)
    }
}
