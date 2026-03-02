import UIKit
import AVFoundation
import Speech

class KeyboardViewController: UIInputViewController {
    private var recordButton: UIButton!
    private var statusLabel: UILabel!
    private var strobeView: UIView!
    private var isRecording = false
    private var audioRecorder: AVAudioRecorder?
    private var recordingTimer: Timer?
    private var recordingDuration: TimeInterval = 0

    private let appGroupId = "group.uk.thewindstorm.windypro"
    private lazy var sharedDefaults = UserDefaults(suiteName: appGroupId)
    private lazy var sharedContainer = FileManager.default
        .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)

    private let colorBackground = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1)
    private let colorAccent = UIColor(red: 163/255, green: 230/255, blue: 53/255, alpha: 1)
    private let colorRecording = UIColor(red: 34/255, green: 197/255, blue: 94/255, alpha: 1)
    private let colorTextMuted = UIColor(red: 148/255, green: 163/255, blue: 184/255, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        let h = view.heightAnchor.constraint(equalToConstant: 260)
        h.priority = .defaultHigh; h.isActive = true
    }

    private func setupUI() {
        view.backgroundColor = colorBackground
        let container = UIStackView()
        container.axis = .vertical; container.alignment = .center; container.spacing = 12
        container.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(container)
        NSLayoutConstraint.activate([
            container.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            container.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        statusLabel = UILabel()
        statusLabel.text = "Tap to Record"
        statusLabel.textColor = colorTextMuted
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        container.addArrangedSubview(statusLabel)

        let buttonContainer = UIView()
        buttonContainer.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            buttonContainer.widthAnchor.constraint(equalToConstant: 88),
            buttonContainer.heightAnchor.constraint(equalToConstant: 88),
        ])

        strobeView = UIView()
        strobeView.layer.cornerRadius = 44
        strobeView.layer.borderWidth = 3
        strobeView.layer.borderColor = UIColor.clear.cgColor
        strobeView.translatesAutoresizingMaskIntoConstraints = false
        strobeView.isHidden = true
        buttonContainer.addSubview(strobeView)
        NSLayoutConstraint.activate([
            strobeView.centerXAnchor.constraint(equalTo: buttonContainer.centerXAnchor),
            strobeView.centerYAnchor.constraint(equalTo: buttonContainer.centerYAnchor),
            strobeView.widthAnchor.constraint(equalToConstant: 88),
            strobeView.heightAnchor.constraint(equalToConstant: 88),
        ])

        recordButton = UIButton(type: .custom)
        recordButton.setTitle("🌪️", for: .normal)
        recordButton.titleLabel?.font = .systemFont(ofSize: 32)
        recordButton.backgroundColor = colorBackground
        recordButton.layer.cornerRadius = 36
        recordButton.layer.borderWidth = 2
        recordButton.layer.borderColor = colorAccent.cgColor
        recordButton.addTarget(self, action: #selector(recordTapped), for: .touchUpInside)
        recordButton.translatesAutoresizingMaskIntoConstraints = false
        buttonContainer.addSubview(recordButton)
        NSLayoutConstraint.activate([
            recordButton.centerXAnchor.constraint(equalTo: buttonContainer.centerXAnchor),
            recordButton.centerYAnchor.constraint(equalTo: buttonContainer.centerYAnchor),
            recordButton.widthAnchor.constraint(equalToConstant: 72),
            recordButton.heightAnchor.constraint(equalToConstant: 72),
        ])
        container.addArrangedSubview(buttonContainer)

        let bottomRow = UIStackView()
        bottomRow.axis = .horizontal; bottomRow.spacing = 16
        let globeBtn = UIButton(type: .system)
        globeBtn.setTitle("🌐", for: .normal)
        globeBtn.titleLabel?.font = .systemFont(ofSize: 20)
        globeBtn.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        bottomRow.addArrangedSubview(globeBtn)
        let returnBtn = UIButton(type: .system)
        returnBtn.setTitle("Return", for: .normal)
        returnBtn.setTitleColor(colorAccent, for: .normal)
        returnBtn.addTarget(self, action: #selector(returnTapped), for: .touchUpInside)
        bottomRow.addArrangedSubview(returnBtn)
        container.addArrangedSubview(bottomRow)
    }

    @objc private func recordTapped() {
        isRecording ? stopRecording() : startRecording()
        if sharedDefaults?.bool(forKey: "hapticFeedback") ?? true {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    @objc private func returnTapped() { textDocumentProxy.insertText("\n") }

    private func startRecording() {
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard granted else { self?.statusLabel.text = "Mic denied"; return }
                self?.beginRecordingSession()
            }
        }
    }

    private func beginRecordingSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.record); try? session.setActive(true)
        guard let containerURL = sharedContainer else { statusLabel.text = "Storage error"; return }
        let audioDir = containerURL.appendingPathComponent("audio", isDirectory: true)
        try? FileManager.default.createDirectory(at: audioDir, withIntermediateDirectories: true)
        let audioURL = audioDir.appendingPathComponent("kb-\(Int(Date().timeIntervalSince1970)).wav")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM), AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
        ]
        do {
            audioRecorder = try AVAudioRecorder(url: audioURL, settings: settings)
            audioRecorder?.record(); isRecording = true; recordingDuration = 0
            recordButton.setTitle("⏹", for: .normal)
            recordButton.layer.borderColor = colorRecording.cgColor
            statusLabel.text = "Recording..."
            strobeView.isHidden = false
            UIView.animate(withDuration: 1.0, delay: 0, options: [.repeat, .autoreverse]) {
                self.strobeView.layer.borderColor = self.colorRecording.cgColor
                self.strobeView.alpha = 0.3
            }
            recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                self?.recordingDuration += 1
                self?.statusLabel.text = String(format: "Recording %d:%02d",
                    Int(self?.recordingDuration ?? 0) / 60, Int(self?.recordingDuration ?? 0) % 60)
            }
        } catch { statusLabel.text = "Record failed" }
    }

    private func stopRecording() {
        recordingTimer?.invalidate(); audioRecorder?.stop()
        guard let audioURL = audioRecorder?.url else { return }
        isRecording = false; strobeView.isHidden = true; strobeView.layer.removeAllAnimations()
        recordButton.setTitle("🌪️", for: .normal)
        recordButton.layer.borderColor = colorAccent.cgColor
        statusLabel.text = "Processing..."

        var pending = sharedDefaults?.array(forKey: "pendingTranscripts") as? [[String: Any]] ?? []
        pending.append(["id": UUID().uuidString, "audioPath": audioURL.path,
                        "timestamp": Date().timeIntervalSince1970, "duration": recordingDuration])
        sharedDefaults?.set(pending, forKey: "pendingTranscripts")

        performSpeechRecognition(audioURL: audioURL)
    }

    private func performSpeechRecognition(audioURL: URL) {
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            statusLabel.text = "Open Windy Pro to transcribe"; return
        }
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard status == .authorized else {
                DispatchQueue.main.async { self?.statusLabel.text = "Speech auth denied" }; return
            }
            recognizer.recognitionTask(with: SFSpeechURLRecognitionRequest(url: audioURL)) { [weak self] result, _ in
                DispatchQueue.main.async {
                    guard let result = result, result.isFinal else { return }
                    let text = result.bestTranscription.formattedString
                    self?.textDocumentProxy.insertText(text)
                    self?.statusLabel.text = "✅ Inserted"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                        self?.statusLabel.text = "Tap to Record"
                    }
                }
            }
        }
    }
}
