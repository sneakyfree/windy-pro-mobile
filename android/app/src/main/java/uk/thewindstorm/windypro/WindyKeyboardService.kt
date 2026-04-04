package uk.thewindstorm.windypro

import android.inputmethodservice.InputMethodService
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.inputmethod.InputConnection
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.TextView
import android.content.SharedPreferences
import android.graphics.drawable.GradientDrawable
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.Manifest
import android.content.pm.PackageManager
import android.widget.Toast
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * WindyKeyboardService — Android IME for Windy Word voice-to-text.
 *
 * Works in ANY Android app (WhatsApp, Gmail, Chrome, etc.).
 * Tap tornado button → record → transcribe → insert text at cursor.
 *
 * Architecture:
 *   IDLE → tap → RECORDING (pulse green) → tap → PROCESSING (yellow)
 *   → transcription result → insert text → IDLE
 *
 * Transcription: Cloud first (POST /api/v1/transcribe), falls back to error toast.
 * On-device whisper.rn requires native module which isn't available in IME context,
 * so cloud is the primary path for the keyboard extension.
 */
class WindyKeyboardService : InputMethodService() {

    // ─── State ──────────────────────────────────────────────────
    enum class State { IDLE, RECORDING, PROCESSING }

    private var state = State.IDLE
    private var audioRecord: AudioRecord? = null
    private var audioData = ByteArrayOutputStream()
    private var isRecording = false
    private var recordingStartTime = 0L

    // ─── Views ──────────────────────────────────────────────────
    private lateinit var statusText: TextView
    private lateinit var transcriptPreview: TextView
    private lateinit var timerText: TextView
    private lateinit var micButton: ImageButton
    private lateinit var glowRing: View
    private lateinit var switchKeyboardBtn: ImageButton
    private lateinit var backspaceBtn: ImageButton

    // ─── Config ─────────────────────────────────────────────────
    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val sampleRate = 16000
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT

    private val prefs: SharedPreferences by lazy {
        getSharedPreferences("windy_keyboard", MODE_PRIVATE)
    }

    private val serverUrl: String
        get() = prefs.getString("server_url", "https://windypro.thewindstorm.uk") ?: "https://windypro.thewindstorm.uk"

    private val authToken: String?
        get() = prefs.getString("jwt_token", null)

    // ─── Glow animation ─────────────────────────────────────────
    private var pulseAnimator: ValueAnimator? = null

    // ─── IME Lifecycle ──────────────────────────────────────────

    override fun onCreateInputView(): View {
        val view = layoutInflater.inflate(R.layout.keyboard_view, null)

        statusText = view.findViewById(R.id.statusText)
        transcriptPreview = view.findViewById(R.id.transcriptPreview)
        timerText = view.findViewById(R.id.timerText)
        micButton = view.findViewById(R.id.micButton)
        glowRing = view.findViewById(R.id.glowRing)
        switchKeyboardBtn = view.findViewById(R.id.switchKeyboardBtn)
        backspaceBtn = view.findViewById(R.id.backspaceBtn)

        // Set up glow ring drawable
        val glowDrawable = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setStroke(4, 0xFFa3e635.toInt())
            setColor(0x00000000)
        }
        glowRing.background = glowDrawable

        micButton.setOnClickListener { onMicTap() }

        switchKeyboardBtn.setOnClickListener {
            switchToNextInputMethod(false)
        }

        backspaceBtn.setOnClickListener {
            currentInputConnection?.deleteSurroundingText(1, 0)
        }

        backspaceBtn.setOnLongClickListener {
            // Delete word on long press
            currentInputConnection?.deleteSurroundingText(20, 0)
            true
        }

        updateUI()
        return view
    }

    override fun onDestroy() {
        stopRecording()
        pulseAnimator?.cancel()
        executor.shutdownNow()
        super.onDestroy()
    }

    // ─── State Machine ──────────────────────────────────────────

    private fun onMicTap() {
        when (state) {
            State.IDLE -> {
                if (!hasMicPermission()) {
                    Toast.makeText(this, "Microphone permission required. Open Windy Pro to grant.", Toast.LENGTH_LONG).show()
                    return
                }
                state = State.RECORDING
                startRecording()
                startPulse()
                updateUI()
            }
            State.RECORDING -> {
                state = State.PROCESSING
                stopRecording()
                stopPulse()
                updateUI()
                transcribeAudio()
            }
            State.PROCESSING -> {
                // Ignore taps during processing
            }
        }
    }

    // ─── Recording ──────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun startRecording() {
        val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            handleError("Audio not available on this device")
            return
        }

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize * 2
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                handleError("Could not initialize audio recorder")
                return
            }

            audioData.reset()
            audioRecord?.startRecording()
            isRecording = true
            recordingStartTime = System.currentTimeMillis()

            // Read audio in background thread
            executor.execute {
                val buffer = ByteArray(bufferSize)
                while (isRecording) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                    if (read > 0) {
                        synchronized(audioData) {
                            audioData.write(buffer, 0, read)
                        }
                    }
                }
            }

            // Update timer every second
            handler.post(object : Runnable {
                override fun run() {
                    if (state == State.RECORDING) {
                        val elapsed = (System.currentTimeMillis() - recordingStartTime) / 1000
                        val min = elapsed / 60
                        val sec = elapsed % 60
                        timerText.text = String.format("%d:%02d", min, sec)
                        handler.postDelayed(this, 1000)
                    }
                }
            })
        } catch (e: SecurityException) {
            handleError("Microphone permission denied")
        } catch (e: Exception) {
            handleError("Recording failed: ${e.message}")
        }
    }

    private fun stopRecording() {
        isRecording = false
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) { }
        audioRecord = null
    }

    // ─── Transcription ──────────────────────────────────────────

    private fun transcribeAudio() {
        val pcmBytes: ByteArray
        synchronized(audioData) {
            pcmBytes = audioData.toByteArray()
        }

        if (pcmBytes.size < sampleRate) { // Less than 0.5 seconds
            handleError("Recording too short")
            return
        }

        // Convert PCM to WAV in memory
        val wavBytes = pcmToWav(pcmBytes, sampleRate, 1, 16)

        executor.execute {
            try {
                val url = URL("$serverUrl/api/v1/transcribe")
                val connection = url.openConnection() as HttpURLConnection
                val boundary = "----WindyBoundary${System.currentTimeMillis()}"

                connection.apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                    authToken?.let { setRequestProperty("Authorization", "Bearer $it") }
                }

                val output = DataOutputStream(connection.outputStream)

                // Audio file part
                output.writeBytes("--$boundary\r\n")
                output.writeBytes("Content-Disposition: form-data; name=\"audio\"; filename=\"recording.wav\"\r\n")
                output.writeBytes("Content-Type: audio/wav\r\n\r\n")
                output.write(wavBytes)
                output.writeBytes("\r\n")

                // Engine parameter
                output.writeBytes("--$boundary\r\n")
                output.writeBytes("Content-Disposition: form-data; name=\"engine\"\r\n\r\n")
                output.writeBytes("cloud-standard\r\n")

                // Language parameter
                output.writeBytes("--$boundary\r\n")
                output.writeBytes("Content-Disposition: form-data; name=\"language\"\r\n\r\n")
                output.writeBytes("auto\r\n")

                output.writeBytes("--$boundary--\r\n")
                output.flush()
                output.close()

                val responseCode = connection.responseCode
                if (responseCode in 200..299) {
                    val body = connection.inputStream.bufferedReader().readText()
                    val json = JSONObject(body)
                    val text = json.optString("text", "")
                        .ifBlank { json.optString("transcript", "") }
                        .ifBlank {
                            // Try segments array
                            val segments = json.optJSONArray("segments")
                            if (segments != null && segments.length() > 0) {
                                buildString {
                                    for (i in 0 until segments.length()) {
                                        if (i > 0) append(" ")
                                        append(segments.getJSONObject(i).optString("text", ""))
                                    }
                                }
                            } else ""
                        }

                    handler.post {
                        if (text.isNotBlank()) {
                            insertText(text.trim())
                            transcriptPreview.text = text.trim()
                            transcriptPreview.visibility = View.VISIBLE
                        } else {
                            handleError("No speech detected")
                        }
                    }
                } else {
                    handler.post { handleError("Server error ($responseCode)") }
                }

                connection.disconnect()
            } catch (e: Exception) {
                handler.post { handleError("Transcription failed: ${e.message?.take(50)}") }
            }
        }
    }

    private fun insertText(text: String) {
        currentInputConnection?.commitText(text, 1)
        state = State.IDLE
        updateUI()
    }

    // ─── WAV Encoding ───────────────────────────────────────────

    private fun pcmToWav(pcm: ByteArray, sampleRate: Int, channels: Int, bitsPerSample: Int): ByteArray {
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val dataSize = pcm.size
        val totalSize = 36 + dataSize

        val out = ByteArrayOutputStream()
        val dos = DataOutputStream(out)

        // RIFF header
        dos.writeBytes("RIFF")
        dos.writeInt(Integer.reverseBytes(totalSize))
        dos.writeBytes("WAVE")

        // fmt chunk
        dos.writeBytes("fmt ")
        dos.writeInt(Integer.reverseBytes(16)) // chunk size
        dos.writeShort(java.lang.Short.reverseBytes(1).toInt()) // PCM format
        dos.writeShort(java.lang.Short.reverseBytes(channels.toShort()).toInt())
        dos.writeInt(Integer.reverseBytes(sampleRate))
        dos.writeInt(Integer.reverseBytes(byteRate))
        dos.writeShort(java.lang.Short.reverseBytes(blockAlign.toShort()).toInt())
        dos.writeShort(java.lang.Short.reverseBytes(bitsPerSample.toShort()).toInt())

        // data chunk
        dos.writeBytes("data")
        dos.writeInt(Integer.reverseBytes(dataSize))
        dos.write(pcm)

        return out.toByteArray()
    }

    // ─── UI Updates ─────────────────────────────────────────────

    private fun updateUI() {
        when (state) {
            State.IDLE -> {
                statusText.text = "Tap \uD83C\uDF2A\uFE0F to speak"
                statusText.setTextColor(0xFF94a3b8.toInt())
                timerText.visibility = View.GONE
                micButton.setColorFilter(0xFFa3e635.toInt())
                (glowRing.background as? GradientDrawable)?.setStroke(4, 0xFFa3e635.toInt())
                glowRing.alpha = 0f
            }
            State.RECORDING -> {
                statusText.text = "Recording... tap to stop"
                statusText.setTextColor(0xFF22c55e.toInt())
                timerText.visibility = View.VISIBLE
                micButton.setColorFilter(0xFF22c55e.toInt())
                (glowRing.background as? GradientDrawable)?.setStroke(6, 0xFF22c55e.toInt())
            }
            State.PROCESSING -> {
                statusText.text = "Transcribing..."
                statusText.setTextColor(0xFFeab308.toInt())
                timerText.visibility = View.GONE
                micButton.setColorFilter(0xFFeab308.toInt())
                (glowRing.background as? GradientDrawable)?.setStroke(6, 0xFFeab308.toInt())
                glowRing.alpha = 0.4f
            }
        }
    }

    private fun handleError(message: String) {
        state = State.IDLE
        updateUI()
        statusText.text = message
        statusText.setTextColor(0xFFef4444.toInt())
        // Reset status text after 3 seconds
        handler.postDelayed({
            if (state == State.IDLE) {
                statusText.text = "Tap \uD83C\uDF2A\uFE0F to speak"
                statusText.setTextColor(0xFF94a3b8.toInt())
            }
        }, 3000)
    }

    // ─── Pulse Animation ────────────────────────────────────────

    private fun startPulse() {
        pulseAnimator?.cancel()
        pulseAnimator = ValueAnimator.ofFloat(0.15f, 0.5f).apply {
            duration = 600
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener { glowRing.alpha = it.animatedValue as Float }
            start()
        }
    }

    private fun stopPulse() {
        pulseAnimator?.cancel()
        pulseAnimator = null
        glowRing.alpha = 0f
    }

    // ─── Permissions ────────────────────────────────────────────

    private fun hasMicPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }
}
