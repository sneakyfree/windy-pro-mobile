/**
 * 🧬 M4.1 — Floating Overlay Service
 * Floating 56dp tornado button using WindowManager TYPE_APPLICATION_OVERLAY.
 * SINGLE TAP toggles recording (idle → recording → processing → idle).
 * DRAG to reposition, snaps to nearest edge on release.
 * LONG PRESS (800ms) hides the button.
 * startForeground() with persistent notification.
 */
package uk.thewindstorm.windypro

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.*
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.math.abs
import android.util.Log

class FloatingOverlayService : Service() {

    companion object {
        const val CHANNEL_ID = "windy_overlay_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_OPEN_APP = "uk.thewindstorm.windypro.OPEN_APP"
        const val ACTION_HIDE = "uk.thewindstorm.windypro.HIDE"
        const val ACTION_STOP = "uk.thewindstorm.windypro.STOP"
        const val PREFS_NAME = "windy_overlay_prefs"

        var isRunning = false
            private set
    }

    // States
    enum class OverlayState { IDLE, RECORDING, PROCESSING }

    private var state = OverlayState.IDLE
    private lateinit var windowManager: WindowManager
    private lateinit var prefs: SharedPreferences
    private var overlayView: FrameLayout? = null
    private var tornadoButton: TextView? = null
    private var glowBackground: View? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private val handler = Handler(Looper.getMainLooper())
    private var pulseRunnable: Runnable? = null

    // Drag tracking
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var isDragging = false
    private var longPressTriggered = false

    // Long-press detection
    private val longPressDelay = 800L
    private val longPressRunnable = Runnable {
        if (!isDragging) {
            longPressTriggered = true
            hideOverlay()
            Toast.makeText(this, "Open Windy Pro to bring back", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        createOverlayView()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HIDE -> hideOverlay()
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_OPEN_APP -> {
                val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                launchIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        stopPulseAnimation()
        overlayView?.let {
            try { windowManager.removeView(it) } catch (e: Exception) { Log.w("WindyOverlay", "removeView in onDestroy failed", e) }
        }
        overlayView = null
        super.onDestroy()
    }

    // ─── Notification ────────────────────────────────────────────

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Windy Pro Overlay",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Floating record button"
            setShowBadge(false)
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        val openIntent = PendingIntent.getService(
            this, 0,
            Intent(this, FloatingOverlayService::class.java).apply { action = ACTION_OPEN_APP },
            PendingIntent.FLAG_IMMUTABLE
        )
        val hideIntent = PendingIntent.getService(
            this, 1,
            Intent(this, FloatingOverlayService::class.java).apply { action = ACTION_HIDE },
            PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Windy Pro")
            .setContentText("Tap tornado to record")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(openIntent)
            .addAction(Notification.Action.Builder(
                null, "Open App", openIntent
            ).build())
            .addAction(Notification.Action.Builder(
                null, "Hide Tornado", hideIntent
            ).build())
            .setOngoing(true)
            .build()
    }

    // ─── Overlay View ────────────────────────────────────────────

    private fun createOverlayView() {
        val buttonSize = (56 * resources.displayMetrics.density).toInt()
        val glowPadding = (8 * resources.displayMetrics.density).toInt()
        val totalSize = buttonSize + glowPadding * 2

        // Container
        overlayView = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(totalSize, totalSize)
        }

        // Glow background (behind button)
        glowBackground = View(this).apply {
            val gd = GradientDrawable()
            gd.shape = GradientDrawable.OVAL
            gd.setColor(Color.TRANSPARENT)
            background = gd
            alpha = 0f
        }
        overlayView?.addView(glowBackground, FrameLayout.LayoutParams(totalSize, totalSize))

        // Tornado button
        tornadoButton = TextView(this).apply {
            text = "🌪️"
            textSize = 24f
            gravity = Gravity.CENTER
            val bg = GradientDrawable()
            bg.shape = GradientDrawable.OVAL
            bg.setColor(Color.parseColor("#0f172a")) // colors.background
            bg.setStroke((2 * resources.displayMetrics.density).toInt(), Color.parseColor("#a3e635")) // colors.accent
            background = bg
            elevation = 8 * resources.displayMetrics.density
        }
        val btnLP = FrameLayout.LayoutParams(buttonSize, buttonSize).apply {
            gravity = Gravity.CENTER
        }
        overlayView?.addView(tornadoButton, btnLP)

        // WindowManager layout params
        val savedX = prefs.getInt("overlay_x", 0)
        val savedY = prefs.getInt("overlay_y", 200)

        layoutParams = WindowManager.LayoutParams(
            totalSize,
            totalSize,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = savedX
            y = savedY
        }

        // Touch listener for drag + tap + long-press
        overlayView?.setOnTouchListener(createTouchListener())

        windowManager.addView(overlayView, layoutParams)
    }

    private fun createTouchListener(): View.OnTouchListener {
        return View.OnTouchListener { _, event ->
            val params = layoutParams ?: return@OnTouchListener false

            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    isDragging = false
                    longPressTriggered = false
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    handler.postDelayed(longPressRunnable, longPressDelay)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - initialTouchX
                    val dy = event.rawY - initialTouchY
                    if (abs(dx) > 10 || abs(dy) > 10) {
                        isDragging = true
                        handler.removeCallbacks(longPressRunnable)
                    }
                    if (isDragging) {
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try { windowManager.updateViewLayout(overlayView, params) } catch (e: Exception) { Log.w("WindyOverlay", "updateViewLayout during drag failed", e) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    handler.removeCallbacks(longPressRunnable)
                    if (longPressTriggered) return@OnTouchListener true

                    if (!isDragging) {
                        // TAP — toggle recording state
                        onTap()
                    } else {
                        // Snap to nearest edge
                        snapToEdge()
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun snapToEdge() {
        val params = layoutParams ?: return
        val screenWidth = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            windowManager.currentWindowMetrics.bounds.width()
        } else {
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.width
        }
        val viewWidth = overlayView?.width ?: 0

        val targetX = if (params.x + viewWidth / 2 < screenWidth / 2) 0 else screenWidth - viewWidth
        params.x = targetX
        try { windowManager.updateViewLayout(overlayView, params) } catch (e: Exception) { Log.w("WindyOverlay", "updateViewLayout in snapToEdge failed", e) }

        // Save position
        prefs.edit()
            .putInt("overlay_x", params.x)
            .putInt("overlay_y", params.y)
            .apply()
    }

    // ─── State Machine ───────────────────────────────────────────

    private fun onTap() {
        triggerHaptic()
        when (state) {
            OverlayState.IDLE -> {
                state = OverlayState.RECORDING
                updateVisuals()
                startPulseAnimation()
                // Emit event to React Native to start recording
                WindyOverlayModule.emitEvent("onOverlayRecord", "start")
            }
            OverlayState.RECORDING -> {
                state = OverlayState.PROCESSING
                updateVisuals()
                stopPulseAnimation()
                // Emit event to React Native to stop recording + transcribe
                WindyOverlayModule.emitEvent("onOverlayRecord", "stop")
            }
            OverlayState.PROCESSING -> {
                // Already processing — ignore taps
            }
        }
    }

    /** Called from WindyOverlayModule when transcription is complete */
    fun onTranscriptionComplete() {
        handler.post {
            state = OverlayState.IDLE
            updateVisuals()
        }
    }

    private fun updateVisuals() {
        val button = tornadoButton ?: return
        val glow = glowBackground ?: return
        val bg = button.background as? GradientDrawable ?: return
        val glowBg = glow.background as? GradientDrawable ?: return

        when (state) {
            OverlayState.IDLE -> {
                bg.setStroke((2 * resources.displayMetrics.density).toInt(), Color.parseColor("#a3e635"))
                glowBg.setColor(Color.TRANSPARENT)
                glow.alpha = 0f
            }
            OverlayState.RECORDING -> {
                bg.setStroke((3 * resources.displayMetrics.density).toInt(), Color.parseColor("#22c55e"))
                glowBg.setColor(Color.parseColor("#22c55e"))
                glow.alpha = 0.3f
            }
            OverlayState.PROCESSING -> {
                bg.setStroke((3 * resources.displayMetrics.density).toInt(), Color.parseColor("#eab308"))
                glowBg.setColor(Color.parseColor("#eab308"))
                glow.alpha = 0.4f
            }
        }
    }

    // ─── Pulse Animation ─────────────────────────────────────────

    private fun startPulseAnimation() {
        pulseRunnable = object : Runnable {
            var growing = true
            override fun run() {
                val glow = glowBackground ?: return
                if (state != OverlayState.RECORDING) return

                val target = if (growing) 0.5f else 0.15f
                glow.animate().alpha(target).setDuration(600).withEndAction {
                    growing = !growing
                    handler.post(this)
                }.start()
            }
        }
        handler.post(pulseRunnable!!)
    }

    private fun stopPulseAnimation() {
        pulseRunnable?.let { handler.removeCallbacks(it) }
        pulseRunnable = null
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private fun hideOverlay() {
        overlayView?.let {
            try { windowManager.removeView(it) } catch (e: Exception) { Log.w("WindyOverlay", "removeView in hideOverlay failed", e) }
        }
        overlayView = null
    }

    private fun triggerHaptic() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(VibratorManager::class.java)
            vm?.defaultVibrator?.vibrate(
                VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            val v = getSystemService(VIBRATOR_SERVICE) as? Vibrator
            v?.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }
}
