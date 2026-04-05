import UIKit
import AVFoundation
import Speech

/**
 * 🧬 M5 — Windy Pro Keyboard Extension
 * Custom keyboard with tornado record button, green strobe ring,
 * mini transcript preview, globe key for switching.
 *
 * Features:
 *   - Big tornado 🌪️ record button with pulse animation
 *   - Green strobe ring during recording
 *   - Audio level meter bar
 *   - Mini transcript preview with auto-insert
 *   - Globe key for keyboard switching
 *   - App Group shared container for main app IPC
 *   - On-device SFSpeechRecognizer for transcription (primary)
 *   - Cloud HTTP POST fallback to /api/v1/transcribe
 *   - Backspace/delete key
 */
class KeyboardViewController: UIInputViewController, AudioRecorderBridgeDelegate {

    // MARK: - UI Elements
    private var recordButton: UIButton!
    private var statusLabel: UILabel!
    private var transcriptPreview: UILabel!
    private var strobeView: UIView!
    private var levelMeterBar: UIView!
    private var levelMeterFill: UIView!
    private var timerLabel: UILabel!

    // MARK: - State
    private let audioBridge = AudioRecorderBridge()
    private var recordingDuration: TimeInterval = 0
    private var recordingTimer: Timer?

    // MARK: - Config
    private let appGroupId = "group.ai.windyword.app"
    private lazy var sharedDefaults = UserDefaults(suiteName: appGroupId)
    private let defaultServerUrl = "https://windyword.ai"

    /// Server URL — configurable via main app settings (shared via App Group)
    private var serverUrl: String {
        sharedDefaults?.string(forKey: "windy-server-url") ?? defaultServerUrl
    }

    // MARK: - Colors
    private let colorBackground = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1)
    private let colorSurface = UIColor(red: 30/255, green: 41/255, blue: 59/255, alpha: 1)
    private let colorAccent = UIColor(red: 163/255, green: 230/255, blue: 53/255, alpha: 1)
    private let colorRecording = UIColor(red: 34/255, green: 197/255, blue: 94/255, alpha: 1)
    private let colorProcessing = UIColor(red: 234/255, green: 179/255, blue: 8/255, alpha: 1)
    private let colorTextPrimary = UIColor.white
    private let colorTextMuted = UIColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        audioBridge.delegate = self
        audioBridge.cleanupOldRecordings()
        setupUI()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        let h = view.heightAnchor.constraint(equalToConstant: 280)
        h.priority = .defaultHigh; h.isActive = true
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = colorBackground

        // Main vertical stack
        let mainStack = UIStackView()
        mainStack.axis = .vertical
        mainStack.alignment = .fill
        mainStack.spacing = 8
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(mainStack)
        NSLayoutConstraint.activate([
            mainStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            mainStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            mainStack.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
            mainStack.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -8),
        ])

        // Top row: transcript preview
        transcriptPreview = UILabel()
        transcriptPreview.text = ""
        transcriptPreview.textColor = colorTextMuted
        transcriptPreview.font = .systemFont(ofSize: 14, weight: .regular)
        transcriptPreview.numberOfLines = 2
        transcriptPreview.backgroundColor = colorSurface
        transcriptPreview.layer.cornerRadius = 8
        transcriptPreview.clipsToBounds = true
        transcriptPreview.textAlignment = .left
        transcriptPreview.isHidden = true
        let previewWrapper = UIView()
        previewWrapper.backgroundColor = colorSurface
        previewWrapper.layer.cornerRadius = 8
        previewWrapper.clipsToBounds = true
        previewWrapper.translatesAutoresizingMaskIntoConstraints = false
        transcriptPreview.translatesAutoresizingMaskIntoConstraints = false
        previewWrapper.addSubview(transcriptPreview)
        NSLayoutConstraint.activate([
            transcriptPreview.leadingAnchor.constraint(equalTo: previewWrapper.leadingAnchor, constant: 10),
            transcriptPreview.trailingAnchor.constraint(equalTo: previewWrapper.trailingAnchor, constant: -10),
            transcriptPreview.topAnchor.constraint(equalTo: previewWrapper.topAnchor, constant: 6),
            transcriptPreview.bottomAnchor.constraint(equalTo: previewWrapper.bottomAnchor, constant: -6),
            previewWrapper.heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
        ])
        previewWrapper.isHidden = true
        mainStack.addArrangedSubview(previewWrapper)

        // Center: Button + status
        let centerStack = UIStackView()
        centerStack.axis = .vertical
        centerStack.alignment = .center
        centerStack.spacing = 6

        statusLabel = UILabel()
        statusLabel.text = "Tap 🌪️ to Record"
        statusLabel.textColor = colorTextMuted
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        centerStack.addArrangedSubview(statusLabel)

        timerLabel = UILabel()
        timerLabel.text = ""
        timerLabel.textColor = colorRecording
        timerLabel.font = .monospacedDigitSystemFont(ofSize: 14, weight: .semibold)
        timerLabel.isHidden = true
        centerStack.addArrangedSubview(timerLabel)

        // Button container (strobe ring + button)
        let buttonContainer = UIView()
        buttonContainer.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            buttonContainer.widthAnchor.constraint(equalToConstant: 96),
            buttonContainer.heightAnchor.constraint(equalToConstant: 96),
        ])

        strobeView = UIView()
        strobeView.layer.cornerRadius = 48
        strobeView.layer.borderWidth = 3
        strobeView.layer.borderColor = UIColor.clear.cgColor
        strobeView.translatesAutoresizingMaskIntoConstraints = false
        strobeView.isHidden = true
        buttonContainer.addSubview(strobeView)
        NSLayoutConstraint.activate([
            strobeView.centerXAnchor.constraint(equalTo: buttonContainer.centerXAnchor),
            strobeView.centerYAnchor.constraint(equalTo: buttonContainer.centerYAnchor),
            strobeView.widthAnchor.constraint(equalToConstant: 96),
            strobeView.heightAnchor.constraint(equalToConstant: 96),
        ])

        recordButton = UIButton(type: .custom)
        recordButton.setTitle("🌪️", for: .normal)
        recordButton.titleLabel?.font = .systemFont(ofSize: 36)
        recordButton.backgroundColor = colorBackground
        recordButton.layer.cornerRadius = 38
        recordButton.layer.borderWidth = 3
        recordButton.layer.borderColor = colorAccent.cgColor
        recordButton.addTarget(self, action: #selector(recordTapped), for: .touchUpInside)
        recordButton.translatesAutoresizingMaskIntoConstraints = false
        buttonContainer.addSubview(recordButton)
        NSLayoutConstraint.activate([
            recordButton.centerXAnchor.constraint(equalTo: buttonContainer.centerXAnchor),
            recordButton.centerYAnchor.constraint(equalTo: buttonContainer.centerYAnchor),
            recordButton.widthAnchor.constraint(equalToConstant: 76),
            recordButton.heightAnchor.constraint(equalToConstant: 76),
        ])

        centerStack.addArrangedSubview(buttonContainer)

        // Level meter
        levelMeterBar = UIView()
        levelMeterBar.backgroundColor = colorSurface
        levelMeterBar.layer.cornerRadius = 3
        levelMeterBar.clipsToBounds = true
        levelMeterBar.translatesAutoresizingMaskIntoConstraints = false
        levelMeterBar.isHidden = true
        NSLayoutConstraint.activate([
            levelMeterBar.heightAnchor.constraint(equalToConstant: 6),
            levelMeterBar.widthAnchor.constraint(equalToConstant: 200),
        ])

        levelMeterFill = UIView()
        levelMeterFill.backgroundColor = colorRecording
        levelMeterFill.layer.cornerRadius = 3
        levelMeterFill.translatesAutoresizingMaskIntoConstraints = false
        levelMeterBar.addSubview(levelMeterFill)
        NSLayoutConstraint.activate([
            levelMeterFill.leadingAnchor.constraint(equalTo: levelMeterBar.leadingAnchor),
            levelMeterFill.topAnchor.constraint(equalTo: levelMeterBar.topAnchor),
            levelMeterFill.bottomAnchor.constraint(equalTo: levelMeterBar.bottomAnchor),
            levelMeterFill.widthAnchor.constraint(equalToConstant: 0),
        ])

        centerStack.addArrangedSubview(levelMeterBar)
        mainStack.addArrangedSubview(centerStack)

        // Bottom row: globe + backspace + space + return
        let bottomRow = UIStackView()
        bottomRow.axis = .horizontal
        bottomRow.spacing = 4
        bottomRow.distribution = .fillEqually

        let globeBtn = makeBottomButton(title: "🌐", action: nil)
        globeBtn.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        bottomRow.addArrangedSubview(globeBtn)

        let deleteBtn = makeBottomButton(title: "⌫", action: #selector(deleteTapped))
        bottomRow.addArrangedSubview(deleteBtn)

        let spaceBtn = makeBottomButton(title: "space", action: #selector(spaceTapped))
        spaceBtn.setTitleColor(colorTextMuted, for: .normal)
        bottomRow.addArrangedSubview(spaceBtn)

        let returnBtn = makeBottomButton(title: "return", action: #selector(returnTapped))
        returnBtn.setTitleColor(colorAccent, for: .normal)
        bottomRow.addArrangedSubview(returnBtn)

        mainStack.addArrangedSubview(bottomRow)
    }

    private func makeBottomButton(title: String, action: Selector?) -> UIButton {
        let btn = UIButton(type: .system)
        btn.setTitle(title, for: .normal)
        btn.titleLabel?.font = .systemFont(ofSize: 16)
        btn.backgroundColor = colorSurface
        btn.layer.cornerRadius = 6
        if let action = action {
            btn.addTarget(self, action: action, for: .touchUpInside)
        }
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.heightAnchor.constraint(equalToConstant: 36).isActive = true
        return btn
    }

    // MARK: - Actions

    @objc private func recordTapped() {
        if audioBridge.isRecording {
            stopRecording()
        } else {
            startRecording()
        }
        if sharedDefaults?.bool(forKey: "hapticFeedback") ?? true {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
        UIView.animate(withDuration: 0.08, animations: {
            self.recordButton.transform = CGAffineTransform(scaleX: 0.85, y: 0.85)
        }) { _ in
            UIView.animate(withDuration: 0.2, delay: 0, usingSpringWithDamping: 0.4, initialSpringVelocity: 5) {
                self.recordButton.transform = .identity
            }
        }
    }

    @objc private func spaceTapped() { textDocumentProxy.insertText(" ") }
    @objc private func returnTapped() { textDocumentProxy.insertText("\n") }
    @objc private func deleteTapped() { textDocumentProxy.deleteBackward() }

    // MARK: - Recording

    private func startRecording() {
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard granted else {
                    self?.statusLabel.text = "⚠️ Mic permission denied"
                    return
                }
                self?.audioBridge.startRecording()
            }
        }
    }

    private func stopRecording() {
        audioBridge.stopRecording()
    }

    private func setRecordingUI(_ recording: Bool) {
        if recording {
            recordButton.setTitle("⏹", for: .normal)
            recordButton.layer.borderColor = colorRecording.cgColor
            statusLabel.text = "Recording..."
            timerLabel.text = "0:00"
            timerLabel.isHidden = false
            levelMeterBar.isHidden = false
            strobeView.isHidden = false
            recordingDuration = 0

            UIView.animate(withDuration: 0.8, delay: 0, options: [.repeat, .autoreverse]) {
                self.strobeView.layer.borderColor = self.colorRecording.cgColor
                self.strobeView.alpha = 0.3
            }

            recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                guard let self = self else { return }
                self.recordingDuration += 1
                self.timerLabel.text = String(format: "%d:%02d",
                    Int(self.recordingDuration) / 60, Int(self.recordingDuration) % 60)
            }
        } else {
            recordButton.setTitle("🌪️", for: .normal)
            recordButton.layer.borderColor = colorAccent.cgColor
            timerLabel.isHidden = true
            levelMeterBar.isHidden = true
            strobeView.isHidden = true
            strobeView.layer.removeAllAnimations()
            strobeView.alpha = 1.0
            recordingTimer?.invalidate()
            recordingTimer = nil
        }
    }

    // MARK: - AudioRecorderBridgeDelegate

    func recorderDidStart() {
        setRecordingUI(true)
    }

    func recorderDidStop(audioURL: URL, duration: TimeInterval) {
        setRecordingUI(false)
        statusLabel.text = "⏳ Transcribing..."
        statusLabel.textColor = colorProcessing

        let id = UUID().uuidString
        audioBridge.queueForMainApp(id: id, audioPath: audioURL.path, duration: duration)

        // Primary: on-device SFSpeech, fallback: cloud HTTP
        performSpeechRecognition(audioURL: audioURL)
    }

    func recorderDidFail(error: String) {
        setRecordingUI(false)
        statusLabel.text = "❌ \(error)"
        statusLabel.textColor = colorTextMuted
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            self?.statusLabel.text = "Tap 🌪️ to Record"
        }
    }

    func recorderMeterUpdate(level: Float) {
        let maxWidth: CGFloat = 200
        let fillWidth = maxWidth * CGFloat(level)
        UIView.animate(withDuration: 0.1) {
            self.levelMeterFill.constraints.first { $0.firstAttribute == .width }?.constant = fillWidth
            self.levelMeterBar.layoutIfNeeded()
        }
    }

    // MARK: - Speech Recognition (On-Device Primary)

    private func performSpeechRecognition(audioURL: URL) {
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            performCloudTranscription(audioURL: audioURL)
            return
        }

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard status == .authorized else {
                DispatchQueue.main.async {
                    self?.performCloudTranscription(audioURL: audioURL)
                }
                return
            }

            let request = SFSpeechURLRecognitionRequest(url: audioURL)
            recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async {
                    if let error = error {
                        print("[WindyKeyboard] SFSpeech failed: \(error.localizedDescription), trying cloud...")
                        self?.performCloudTranscription(audioURL: audioURL)
                        return
                    }

                    guard let result = result else { return }
                    let text = result.bestTranscription.formattedString
                    self?.showTranscriptPreview(text)

                    if result.isFinal {
                        self?.textDocumentProxy.insertText(text)
                        self?.statusLabel.text = "✅ Inserted"
                        self?.statusLabel.textColor = self?.colorAccent ?? .green
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                            self?.statusLabel.text = "Tap 🌪️ to Record"
                            self?.statusLabel.textColor = self?.colorTextMuted ?? .gray
                            self?.hideTranscriptPreview()
                        }
                    }
                }
            }
        }
    }

    // MARK: - Cloud Transcription (Fallback)

    /**
     * 🧬 M5.2 — Cloud transcription fallback
     * HTTP POST multipart/form-data to /api/v1/transcribe
     * Used when SFSpeechRecognizer is unavailable or fails.
     */
    private func performCloudTranscription(audioURL: URL) {
        statusLabel.text = "☁️ Cloud transcribing..."
        statusLabel.textColor = colorProcessing

        let url = URL(string: "\(serverUrl)/api/v1/transcribe")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Language field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"language\"\r\n\r\n".data(using: .utf8)!)
        body.append("en\r\n".data(using: .utf8)!)

        // Engine field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"engine\"\r\n\r\n".data(using: .utf8)!)
        body.append("cloud-standard\r\n".data(using: .utf8)!)

        // Audio file
        if let audioData = try? Data(contentsOf: audioURL) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"recording.wav\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
            body.append(audioData)
            body.append("\r\n".data(using: .utf8)!)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.statusLabel.text = "❌ Cloud: \(error.localizedDescription)"
                    self?.statusLabel.textColor = self?.colorTextMuted ?? .gray
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        self?.statusLabel.text = "Tap 🌪️ to Record"
                    }
                    return
                }

                guard let data = data,
                      let httpResponse = response as? HTTPURLResponse,
                      httpResponse.statusCode == 200 else {
                    self?.statusLabel.text = "❌ Server error"
                    self?.statusLabel.textColor = self?.colorTextMuted ?? .gray
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        self?.statusLabel.text = "Tap 🌪️ to Record"
                    }
                    return
                }

                // Parse JSON response { text: "..." }
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let text = json["text"] as? String, !text.isEmpty {
                    self?.showTranscriptPreview(text)
                    self?.textDocumentProxy.insertText(text)
                    self?.statusLabel.text = "✅ Inserted (cloud)"
                    self?.statusLabel.textColor = self?.colorAccent ?? .green
                } else {
                    let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    if !text.isEmpty {
                        self?.showTranscriptPreview(text)
                        self?.textDocumentProxy.insertText(text)
                        self?.statusLabel.text = "✅ Inserted (cloud)"
                        self?.statusLabel.textColor = self?.colorAccent ?? .green
                    } else {
                        self?.statusLabel.text = "⚠️ No text detected"
                        self?.statusLabel.textColor = self?.colorTextMuted ?? .gray
                    }
                }

                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    self?.statusLabel.text = "Tap 🌪️ to Record"
                    self?.statusLabel.textColor = self?.colorTextMuted ?? .gray
                    self?.hideTranscriptPreview()
                }
            }
        }
        task.resume()
    }

    // MARK: - Transcript Preview

    private func showTranscriptPreview(_ text: String) {
        transcriptPreview.text = text
        transcriptPreview.textColor = colorTextPrimary
        if let wrapper = transcriptPreview.superview {
            wrapper.isHidden = false
            UIView.animate(withDuration: 0.2) { wrapper.alpha = 1.0 }
        }
    }

    private func hideTranscriptPreview() {
        if let wrapper = transcriptPreview.superview {
            UIView.animate(withDuration: 0.3, animations: { wrapper.alpha = 0 }) { _ in
                wrapper.isHidden = true
                self.transcriptPreview.text = ""
            }
        }
    }
}
