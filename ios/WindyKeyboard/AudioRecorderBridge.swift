import AVFoundation
import UIKit

/**
 * 🧬 M5 — Audio Recorder Bridge
 * Handles AVAudioRecorder lifecycle in the keyboard extension context
 * with App Group shared container for file storage.
 *
 * Features:
 *   - WAV recording at 16kHz/16-bit (optimized for speech)
 *   - Audio metering for waveform / level display
 *   - Shared container file storage via App Group
 *   - Audio session management safe for keyboard extension
 */

protocol AudioRecorderBridgeDelegate: AnyObject {
    func recorderDidStart()
    func recorderDidStop(audioURL: URL, duration: TimeInterval)
    func recorderDidFail(error: String)
    func recorderMeterUpdate(level: Float)  // 0.0 - 1.0
}

class AudioRecorderBridge: NSObject, AVAudioRecorderDelegate {
    weak var delegate: AudioRecorderBridgeDelegate?

    private var recorder: AVAudioRecorder?
    private var meterTimer: Timer?
    private var startTime: Date?
    private var duration: TimeInterval = 0

    private let appGroupId = "group.uk.thewindstorm.windypro"
    private lazy var sharedContainer = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)

    /// Whether currently recording
    var isRecording: Bool { recorder?.isRecording ?? false }

    // MARK: - Recording Control

    /**
     * Start recording to the shared App Group container
     */
    func startRecording() {
        // Configure audio session
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: [])
            try session.setActive(true, options: [])
        } catch {
            delegate?.recorderDidFail(error: "Audio session: \(error.localizedDescription)")
            return
        }

        // Create audio file in shared container
        guard let containerURL = sharedContainer else {
            delegate?.recorderDidFail(error: "App Group container unavailable")
            return
        }

        let audioDir = containerURL.appendingPathComponent("audio", isDirectory: true)
        try? FileManager.default.createDirectory(at: audioDir, withIntermediateDirectories: true)

        let timestamp = Int(Date().timeIntervalSince1970)
        let audioURL = audioDir.appendingPathComponent("kb-\(timestamp).wav")

        // Recording settings optimized for speech recognition
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
        ]

        do {
            recorder = try AVAudioRecorder(url: audioURL, settings: settings)
            recorder?.delegate = self
            recorder?.isMeteringEnabled = true
            recorder?.record()
            startTime = Date()

            // Start metering timer
            meterTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                self?.updateMeter()
            }

            delegate?.recorderDidStart()
        } catch {
            delegate?.recorderDidFail(error: "Record failed: \(error.localizedDescription)")
        }
    }

    /**
     * Stop recording and return the audio file URL
     */
    func stopRecording() {
        meterTimer?.invalidate()
        meterTimer = nil

        guard let recorder = recorder, recorder.isRecording else { return }
        duration = startTime.map { Date().timeIntervalSince($0) } ?? 0
        let url = recorder.url
        recorder.stop()
        self.recorder = nil

        // Deactivate audio session
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])

        delegate?.recorderDidStop(audioURL: url, duration: duration)
    }

    /**
     * Cancel recording and delete the file
     */
    func cancelRecording() {
        meterTimer?.invalidate()
        meterTimer = nil

        guard let recorder = recorder else { return }
        let url = recorder.url
        recorder.stop()
        try? FileManager.default.removeItem(at: url)
        self.recorder = nil

        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    // MARK: - Metering

    private func updateMeter() {
        guard let recorder = recorder, recorder.isRecording else { return }
        recorder.updateMeters()
        // Convert dB power (-160...0) to linear 0.0...1.0
        let power = recorder.averagePower(forChannel: 0)
        let normalizedLevel = max(0, min(1, (power + 60) / 60))
        delegate?.recorderMeterUpdate(level: normalizedLevel)
    }

    // MARK: - Shared Container Helpers

    /**
     * Queue a recording for main app processing via shared UserDefaults
     */
    func queueForMainApp(id: String, audioPath: String, duration: TimeInterval) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }

        var pending = defaults.array(forKey: "pendingTranscripts") as? [[String: Any]] ?? []
        pending.append([
            "id": id,
            "audioPath": audioPath,
            "timestamp": Date().timeIntervalSince1970,
            "duration": duration,
            "source": "keyboard",
        ])
        defaults.set(pending, forKey: "pendingTranscripts")
        defaults.synchronize()
    }

    /**
     * Get any transcription results sent back from the main app
     */
    func getCompletedTranscripts() -> [[String: Any]] {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return [] }
        return defaults.array(forKey: "completedTranscripts") as? [[String: Any]] ?? []
    }

    /**
     * Clear completed transcripts after reading
     */
    func clearCompletedTranscripts() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        defaults.removeObject(forKey: "completedTranscripts")
        defaults.synchronize()
    }

    /**
     * Clean up old audio files (older than 24h)
     */
    func cleanupOldRecordings() {
        guard let containerURL = sharedContainer else { return }
        let audioDir = containerURL.appendingPathComponent("audio", isDirectory: true)
        guard let files = try? FileManager.default.contentsOfDirectory(at: audioDir, includingPropertiesForKeys: [.creationDateKey]) else { return }

        let cutoff = Date().addingTimeInterval(-86400) // 24h ago
        for file in files {
            if let attrs = try? file.resourceValues(forKeys: [.creationDateKey]),
               let created = attrs.creationDate, created < cutoff {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }

    // MARK: - AVAudioRecorderDelegate

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            delegate?.recorderDidFail(error: "Recording did not finish successfully")
        }
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        delegate?.recorderDidFail(error: error?.localizedDescription ?? "Encode error")
    }
}
