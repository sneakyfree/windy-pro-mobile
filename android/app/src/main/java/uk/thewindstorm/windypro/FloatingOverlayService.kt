package uk.thewindstorm.windypro

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.graphics.drawable.GradientDrawable
import android.animation.ValueAnimator
import android.animation.ArgbEvaluator
import android.animation.ObjectAnimator
import android.graphics.Color
import android.view.animation.LinearInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.TextView

class FloatingOverlayService : Service() {

    companion object {
        const val CHANNEL_ID = "windy_overlay"
        const val NOTIFICATION_ID = 9001
        const val ACTION_START = "uk.thewindstorm.windypro.START"
        const val ACTION_STOP = "uk.thewindstorm.windypro.STOP"
        const val ACTION_UPDATE_STATE = "uk.thewindstorm.windypro.UPDATE_STATE"
        const val EXTRA_STATE = "state"
        const val COLOR_IDLE = "#6B7280"
        const val COLOR_RECORDING = "#22C55E"
        const val COLOR_PROCESSING = "#EAB308"
        const val COLOR_ERROR = "#EF4444"
        const val COLOR_BACKGROUND = "#0F172A"
        var isActive = false
            private set
    }

    private lateinit var windowManager: WindowManager
    private var floatingView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private var strobeAnimator: ValueAnimator? = null
    private var currentState = "idle"
    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var lastTapTime = 0L
    private var tapCount = 0
    private var screenWidth = 0

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        screenWidth = resources.displayMetrics.widthPixels
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startOverlay()
            ACTION_STOP -> stopOverlay()
            ACTION_UPDATE_STATE -> updateState(intent.getStringExtra(EXTRA_STATE) ?: "idle")
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startOverlay() {
        if (floatingView != null) return
        val size = dpToPx(64)
        val container = FrameLayout(this)

        val strobeRing = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(size + dpToPx(12), size + dpToPx(12)).apply {
                gravity = Gravity.CENTER
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setStroke(dpToPx(3), Color.parseColor(COLOR_IDLE))
            }
            elevation = 10f
            visibility = View.GONE
        }
        container.addView(strobeRing)

        val button = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor(COLOR_BACKGROUND))
                setStroke(dpToPx(2), Color.parseColor(COLOR_IDLE))
            }
            elevation = 20f
        }
        container.addView(button)

        // Tornado emoji label
        val label = TextView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply { gravity = Gravity.CENTER }
            text = "🌪️"
            textSize = 22f
            elevation = 25f
        }
        container.addView(label)

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        overlayParams = WindowManager.LayoutParams(
            size + dpToPx(16), size + dpToPx(16), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = dpToPx(16); y = dpToPx(200) }

        container.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = overlayParams!!.x; initialY = overlayParams!!.y
                    initialTouchX = event.rawX; initialTouchY = event.rawY; true
                }
                MotionEvent.ACTION_MOVE -> {
                    overlayParams!!.x = initialX + (event.rawX - initialTouchX).toInt()
                    overlayParams!!.y = initialY + (event.rawY - initialTouchY).toInt()
                    windowManager.updateViewLayout(floatingView, overlayParams); true
                }
                MotionEvent.ACTION_UP -> {
                    val dx = event.rawX - initialTouchX; val dy = event.rawY - initialTouchY
                    if (Math.sqrt((dx * dx + dy * dy).toDouble()) <= dpToPx(10)) {
                        val now = System.currentTimeMillis()
                        tapCount = if (now - lastTapTime < 300) tapCount + 1 else 1
                        lastTapTime = now
                        if (tapCount >= 3) stopOverlay() else {
                            // Scale bounce animation on tap
                            container.animate()
                                .scaleX(0.8f).scaleY(0.8f).setDuration(80)
                                .withEndAction {
                                    container.animate().scaleX(1.0f).scaleY(1.0f)
                                        .setDuration(200)
                                        .setInterpolator(OvershootInterpolator(3f))
                                        .start()
                                }.start()
                            sendRecordToggle()
                        }
                    } else {
                        // Edge-snap: animate to nearest horizontal edge
                        snapToEdge()
                    }; true
                }
                else -> false
            }
        }

        floatingView = container
        windowManager.addView(floatingView, overlayParams)
        isActive = true
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    private fun stopOverlay() {
        strobeAnimator?.cancel()
        floatingView?.let { windowManager.removeView(it) }
        floatingView = null; isActive = false
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }

    private fun updateState(state: String) {
        currentState = state
        val color = when (state) {
            "recording" -> Color.parseColor(COLOR_RECORDING)
            "processing" -> Color.parseColor(COLOR_PROCESSING)
            "error" -> Color.parseColor(COLOR_ERROR)
            else -> Color.parseColor(COLOR_IDLE)
        }
        floatingView?.let { container ->
            if (container is FrameLayout && container.childCount >= 2) {
                val strobeRing = container.getChildAt(0)
                val button = container.getChildAt(1)
                (button.background as? GradientDrawable)?.setStroke(dpToPx(2), color)
                if (state == "recording" || state == "processing") {
                    strobeRing.visibility = View.VISIBLE
                    startStrobeAnimation(strobeRing, color)
                } else { strobeRing.visibility = View.GONE; strobeAnimator?.cancel() }
            }
        }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, buildNotification())
    }

    private fun startStrobeAnimation(view: View, color: Int) {
        strobeAnimator?.cancel()
        strobeAnimator = ValueAnimator.ofObject(ArgbEvaluator(), color,
            Color.argb(0, Color.red(color), Color.green(color), Color.blue(color))).apply {
            duration = 1000; repeatCount = ValueAnimator.INFINITE; repeatMode = ValueAnimator.REVERSE
            interpolator = LinearInterpolator()
            addUpdateListener { (view.background as? GradientDrawable)?.setStroke(dpToPx(3), it.animatedValue as Int) }
            start()
        }
    }

    private fun snapToEdge() {
        val params = overlayParams ?: return
        val buttonWidth = params.width
        val centerX = params.x + buttonWidth / 2
        val targetX = if (centerX < screenWidth / 2) dpToPx(4) else screenWidth - buttonWidth - dpToPx(4)

        val animator = ValueAnimator.ofInt(params.x, targetX).apply {
            duration = 250
            interpolator = OvershootInterpolator(1.5f)
            addUpdateListener { anim ->
                params.x = anim.animatedValue as Int
                try { windowManager.updateViewLayout(floatingView, params) } catch (_: Exception) {}
            }
        }
        animator.start()
    }

    private fun sendRecordToggle() {
        sendBroadcast(Intent("uk.thewindstorm.windypro.OVERLAY_TAP"))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Windy Pro Overlay", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Keeps the floating Windy button active"; setShowBadge(false)
                }
            )
        }
    }

    private fun buildNotification(): Notification {
        val label = when (currentState) {
            "recording" -> "🎤 Recording..."; "processing" -> "⏳ Processing..."
            "error" -> "❌ Error"; else -> "🌪️ Windy Pro — Tap to record"
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Windy Pro").setContentText(label)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(PendingIntent.getActivity(this, 0,
                packageManager.getLaunchIntentForPackage(packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            .setOngoing(true).build()
    }

    private fun dpToPx(dp: Int): Int = (dp * resources.displayMetrics.density).toInt()

    override fun onDestroy() { stopOverlay(); super.onDestroy() }
}
