import SwiftUI
#if DEBUG || WATCH_TEST_CANDIDATE
import AVFoundation
import WatchKit
import WatchConnectivity

final class Experiment: NSObject, ObservableObject, WCSessionDelegate {
    @Published var status = "Not sent"
    @Published private(set) var phase: CountdownState.Phase = .ready
    @Published private(set) var remaining = 300
    @Published private(set) var presetMinutes = 5
    @Published var soundEnabled = true
    private var countdown: CountdownState
    private let presetStore = CountdownPresetStore(defaults: .standard)
    private var finishTask: DispatchWorkItem?
    private var timer: Timer?
    private var sceneIsActive = false
    private var workoutIsActive = false
    private var shortBeep: AVAudioPlayer?
    private var zeroBeep: AVAudioPlayer?

    override init() {
        let saved = CountdownPresetStore(defaults: .standard).load()
        countdown = CountdownState(presetMinutes: saved)
        super.init()
        presetMinutes = countdown.presetMinutes
        remaining = countdown.presetSeconds
        preloadSounds()
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        #if targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--watch-auto-countdown") {
            DispatchQueue.main.async { self.start() }
        }
        if ProcessInfo.processInfo.arguments.contains("--watch-auto-send") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.send() }
        }
        if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--watch-layout-seconds"),
           index + 1 < ProcessInfo.processInfo.arguments.count,
           let seconds = Int(ProcessInfo.processInfo.arguments[index + 1]), (0...300).contains(seconds) {
            countdown.start(at: .now, seconds: seconds)
            if seconds == 0 {
                _ = countdown.update(at: .now, allowCue: false)
                phase = .finished
            } else {
                _ = countdown.pause(at: .now)
                phase = .paused
            }
            remaining = seconds
        }
        #endif
    }
    func selectPreset(_ minutes: Int) {
        guard countdown.selectPreset(minutes) else { return }
        presetMinutes = countdown.presetMinutes
        remaining = countdown.presetSeconds
        presetStore.save(presetMinutes)
    }
    func start() {
        guard phase == .ready else { return }
        finishTask?.cancel()
        countdown.start(at: .now)
        phase = .running
        remaining = countdown.presetSeconds
        updateExecution()
    }
    func pauseOrResume() {
        let now = ContinuousClock.now
        if phase == .running {
            if countdown.pause(at: now) {
                phase = .paused
                remaining = countdown.remaining(at: now)
                timer?.invalidate(); timer = nil
            } else { tick(allowCue: false) }
        } else if phase == .paused, countdown.resume(at: now) {
            phase = .running
            updateExecution()
        }
    }
    func skip() {
        let now = ContinuousClock.now
        if countdown.skip(at: now) { remaining = countdown.remaining(at: now) }
        else if phase == .running { tick(allowCue: false) }
    }
    var canSkip: Bool { phase == .running && countdown.remaining(at: .now) > 60 }
    func cancel() {
        finishTask?.cancel(); finishTask = nil
        timer?.invalidate(); timer = nil
        countdown.cancel()
        phase = .ready
        remaining = countdown.presetSeconds
    }
    func setActive(_ active: Bool) {
        sceneIsActive = active
        updateExecution()
    }
    func setWorkoutActive(_ active: Bool) {
        workoutIsActive = active
        updateExecution()
    }
    private func updateExecution() {
        timer?.invalidate()
        timer = nil
        guard sceneIsActive || workoutIsActive, phase == .running else { return }
        tick(allowCue: false)
        if phase == .running { startTimer() }
    }
    private func startTimer() {
        let next = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick(allowCue: true) }
        RunLoop.main.add(next, forMode: .common)
        timer = next
    }
    private func preloadSounds() {
        // Ambient audio follows the system's silent-mode policy and does not
        // request background audio execution or force an output route.
        do { try AVAudioSession.sharedInstance().setCategory(.ambient) }
        catch { NSLog("Watch feasibility: ambient audio session unavailable") }
        shortBeep = loadSound(named: "CountdownShort")
        zeroBeep = loadSound(named: "CountdownZero")
    }
    private func loadSound(named name: String) -> AVAudioPlayer? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
              let player = try? AVAudioPlayer(contentsOf: url) else {
            NSLog("Watch feasibility: bundled sound unavailable (%@)", name)
            return nil
        }
        player.prepareToPlay()
        return player
    }
    private func playSound(_ sound: CountdownSound, at seconds: Int) {
        guard soundEnabled else { return }
        let player = sound == .zero ? zeroBeep : shortBeep
        guard let player else { return }
        player.currentTime = 0
        if player.play() { NSLog("Watch feasibility: audio request %d", seconds) }
    }
    private func tick(allowCue: Bool) {
        guard let result = countdown.update(at: .now, allowCue: allowCue) else { return }
        remaining = result.remaining
        if let seconds = result.cue {
            if let output = CountdownCueOutput.forSecond(seconds) {
                NSLog("Watch feasibility: haptic request %d", seconds)
                let haptic: WKHapticType = output.haptic == .success ? .success : .click
                WKInterfaceDevice.current().play(haptic)
                playSound(output.sound, at: seconds)
            }
        }
        if result.remaining == 0 {
            timer?.invalidate()
            timer = nil
            phase = .finished
            let task = DispatchWorkItem { [weak self] in
                guard let self, self.phase == .finished else { return }
                self.countdown.finishDisplay()
                self.phase = .ready
                self.remaining = self.countdown.presetSeconds
            }
            finishTask = task
            DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: task)
        }
    }
    func send() {
        guard WCSession.default.activationState == .activated, WCSession.default.isReachable else { status = "Phone unreachable"; NSLog("Watch feasibility: phone unreachable"); return }
        status = "Awaiting JS"
        WCSession.default.sendMessage(["kind": "watch-feasibility", "id": UUID().uuidString], replyHandler: { [weak self] reply in
            DispatchQueue.main.async { let processed = reply["processed"] as? Bool == true
                self?.status = processed ? "JS processed" : "JS not confirmed"
                NSLog(processed ? "Watch feasibility: JS processed" : "Watch feasibility: JS not confirmed") }
        }, errorHandler: { [weak self] _ in DispatchQueue.main.async { self?.status = "Delivery failed"; NSLog("Watch feasibility: delivery failed") } })
    }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
}

@main struct WatchFeasibilityApp: App {
    @StateObject private var experiment = Experiment()
    #if WATCH_TEST_CANDIDATE
    @WKApplicationDelegateAdaptor(WatchTestWorkoutAppDelegate.self) private var workoutAppDelegate
    @StateObject private var workout = SailingWorkout()
    #endif
    @Environment(\.scenePhase) private var scenePhase
    @State private var crownValue = 5.0
    @State private var showActions = false
    @State private var confirmReset = false
    @State private var actionGeneration = 0

    private func openActions() {
        guard experiment.phase == .running || experiment.phase == .paused else { return }
        showActions = true
        actionGeneration += 1
        let generation = actionGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            if generation == actionGeneration { showActions = false }
        }
    }
    private func closeActions() { actionGeneration += 1; showActions = false }

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                GeometryReader { geometry in
                    VStack(spacing: 2) {
                        Spacer(minLength: 0)
                        Text(String(format: "%d:%02d", experiment.remaining / 60, experiment.remaining % 60))
                            .font(.system(size: min(geometry.size.width * 0.37, geometry.size.height * 0.39), weight: .bold, design: .rounded))
                            .monospacedDigit().lineLimit(1).minimumScaleFactor(0.65)
                            .accessibilityLabel("Time remaining")
                        if experiment.phase == .paused { Text("PAUSAD").font(.caption2.bold()) }
                        if experiment.phase == .finished { Text("START!").font(.caption.bold()) }
                        #if WATCH_TEST_CANDIDATE
                        if experiment.phase == .running {
                            TimelineView(.periodic(from: .now, by: 1)) { context in
                                if let bpm = workout.liveHeartRate(at: context.date) {
                                    Label("\(bpm) bpm", systemImage: "heart.fill").font(.caption2).foregroundStyle(.red)
                                        .accessibilityLabel("Heart rate, \(bpm) beats per minute")
                                }
                            }
                        }
                        #endif
                        if experiment.phase != .finished {
                            Text(experiment.phase == .ready ? "START" : (experiment.phase == .paused ? "FORTSÄTT" : "PAUSA"))
                                .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 8)
                                .background(Capsule().fill(Color.white.opacity(0.22)))
                                .contentShape(Capsule())
                                .gesture(LongPressGesture(minimumDuration: 0.7).exclusively(before: TapGesture()).onEnded { result in
                                    switch result {
                                    case .first: openActions()
                                    case .second:
                                        if experiment.phase == .ready { experiment.start() }
                                        else { experiment.pauseOrResume() }
                                    }
                                })
                                .accessibilityAddTraits(.isButton)
                                .accessibilityAction { if experiment.phase == .ready { experiment.start() } else { experiment.pauseOrResume() } }
                                .accessibilityAction(named: Text("Countdown actions")) { openActions() }
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
                    .focusable(experiment.phase == .ready)
                    .digitalCrownRotation($crownValue, from: 1, through: 5, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                    .onChange(of: crownValue) { _, value in experiment.selectPreset(Int(value.rounded())) }
                }
                .onAppear {
                    crownValue = Double(experiment.presetMinutes)
                    experiment.setActive(scenePhase == .active)
                    #if WATCH_TEST_CANDIDATE
                    workoutAppDelegate.installRecoveryHandler { workout.checkForRecoverableWorkout() }
                    workout.checkForRecoverableWorkout()
                    #endif
                }
                .onChange(of: scenePhase) { _, phase in experiment.setActive(phase == .active) }
                .onChange(of: experiment.phase) { _, phase in
                    if phase == .finished || phase == .ready {
                        closeActions()
                        confirmReset = false
                    }
                }
                #if WATCH_TEST_CANDIDATE
                .onChange(of: workout.active) { _, active in experiment.setWorkoutActive(active) }
                #endif
                .confirmationDialog("Countdown actions", isPresented: $showActions, titleVisibility: .visible) {
                    Button("Skip to whole minute") { closeActions(); experiment.skip() }.disabled(!experiment.canSkip)
                    Button("Stop/reset", role: .destructive) { closeActions(); confirmReset = true }
                }
                .confirmationDialog("Stop and reset countdown?", isPresented: $confirmReset, titleVisibility: .visible) {
                    Button("Stop and reset", role: .destructive) { experiment.cancel() }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            List {
                                #if WATCH_TEST_CANDIDATE
                                NavigationLink("Sailing workout") { SailingWorkoutView(workout: workout) }
                                #endif
                                Toggle("Sound cues", isOn: $experiment.soundEnabled)
                                Button("Send test") { experiment.send() }
                                Text(experiment.status).font(.caption)
                            }
                        } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("Workout and settings")
                    }
                }
            }
        }
    }
}

#else
@main struct WatchFeasibilityApp: App {
    var body: some Scene { WindowGroup { Text("Unavailable") } }
}
#endif
