/**
 * 🧬 M4.2 — Paste Accessibility Service
 * Saves the currently focused input field before recording starts,
 * then pastes transcription result at cursor position when complete.
 *
 * Flow:
 *   1. BEFORE recording: save focused AccessibilityNodeInfo + cursor position
 *   2. ON transcript complete: clipboard set → focus restore → ACTION_PASTE → restore clipboard
 *   3. Fallback: clipboard-only + toast if no focused text field
 */
package uk.thewindstorm.windypro

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import android.util.Log

class PasteAccessibilityService : AccessibilityService() {

    companion object {
        var instance: PasteAccessibilityService? = null
            private set
        var isEnabled = false
            private set
    }

    // Saved state before recording
    private var savedNodeInfo: AccessibilityNodeInfo? = null
    private var savedCursorStart: Int = -1
    private var savedCursorEnd: Int = -1
    private var previousClipText: CharSequence? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        isEnabled = true

        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPE_VIEW_FOCUSED or
                    AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.DEFAULT
            notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Track last focused editable text field
        if (event?.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
            val source = event.source ?: return
            if (source.isEditable) {
                savedNodeInfo?.recycle()
                savedNodeInfo = AccessibilityNodeInfo.obtain(source)
            }
            source.recycle()
        }
    }

    override fun onInterrupt() {
        savedNodeInfo?.recycle()
        savedNodeInfo = null
    }

    override fun onDestroy() {
        instance = null
        isEnabled = false
        savedNodeInfo?.recycle()
        savedNodeInfo = null
        super.onDestroy()
    }

    // ─── Public API ──────────────────────────────────────────────

    /**
     * Save the currently focused input field state.
     * Called right before recording starts.
     */
    fun saveFocusedField() {
        val rootNode = rootInActiveWindow ?: return
        val editableNode = findFocusedEditable(rootNode)

        if (editableNode != null) {
            savedNodeInfo?.recycle()
            savedNodeInfo = AccessibilityNodeInfo.obtain(editableNode)
            // Save cursor position
            val textSel = editableNode.textSelectionStart
            savedCursorStart = if (textSel >= 0) textSel else -1
            savedCursorEnd = if (editableNode.textSelectionEnd >= 0) editableNode.textSelectionEnd else savedCursorStart
            editableNode.recycle()
        }
        rootNode.recycle()
    }

    /**
     * Paste transcription text into the previously focused field.
     * Falls back to clipboard-only if no field was saved.
     */
    fun pasteTranscript(text: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

        // Save previous clipboard content
        previousClipText = try {
            clipboard.primaryClip?.getItemAt(0)?.text
        } catch (e: Exception) { Log.w("WindyPaste", "Failed to read previous clipboard", e); null }

        // Set transcript to clipboard
        clipboard.setPrimaryClip(ClipData.newPlainText("Windy Pro Transcript", text))

        val node = savedNodeInfo
        if (node != null) {
            try {
                // Focus the saved node
                node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)

                // Restore cursor position if we have one
                if (savedCursorStart >= 0) {
                    val args = Bundle().apply {
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, savedCursorStart)
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, savedCursorEnd)
                    }
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, args)
                }

                // Paste
                node.performAction(AccessibilityNodeInfo.ACTION_PASTE)

                // Restore previous clipboard after short delay
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    restoreClipboard()
                }, 500)
            } catch (e: Exception) {
                Log.w("WindyPaste", "Paste via accessibility failed", e)
                // Fallback: clipboard only
                showToast("📋 Transcript copied to clipboard")
            }
        } else {
            // No saved field — clipboard only
            showToast("📋 Transcript copied to clipboard")
        }

        // Reset saved state
        savedNodeInfo?.recycle()
        savedNodeInfo = null
        savedCursorStart = -1
        savedCursorEnd = -1
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private fun findFocusedEditable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isFocused && node.isEditable) {
            return AccessibilityNodeInfo.obtain(node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findFocusedEditable(child)
            child.recycle()
            if (result != null) return result
        }
        return null
    }

    private fun restoreClipboard() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val prev = previousClipText
        if (prev != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("Previous", prev))
        }
        previousClipText = null
    }

    private fun showToast(message: String) {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }
}
