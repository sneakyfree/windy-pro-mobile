package uk.thewindstorm.windypro

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class PasteAccessibilityService : AccessibilityService() {
    companion object {
        private var instance: PasteAccessibilityService? = null
        fun pasteText(text: String) { instance?.performPaste(text) }
        fun isEnabled(): Boolean = instance != null
    }

    override fun onServiceConnected() { super.onServiceConnected(); instance = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() { instance = null; super.onDestroy() }

    private fun performPaste(text: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Windy Pro", text))
        val root = rootInActiveWindow ?: return
        val focused = findFocusedTextField(root)
        if (focused != null) {
            val args = Bundle()
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } else {
            performGlobalAction(GLOBAL_ACTION_PASTE)
        }
    }

    private fun findFocusedTextField(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (root.isFocused && root.isEditable) return root
        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            val result = findFocusedTextField(child)
            if (result != null) return result
        }
        return null
    }
}
