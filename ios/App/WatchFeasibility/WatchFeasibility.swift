import SwiftUI
#if DEBUG || WATCH_TEST_CANDIDATE
import AVFoundation
import WatchKit
import WatchConnectivity

final class Experiment: NSObject, ObservableObject, WCSessionDelegate {
    @Published var status = "Not sent"
    @Published var countdownStatus = "Ready"
    @Published var remaining = 60
    @Published var soundEnabled = true
    private var countdown = CountdownState()
    private var timer: Timer?
    private var sceneIsActive = false
    private var workoutIsActive = false
    private var shortBeep: AVAudioPlayer?
    private var zeroBeep: AVAudioPlayer?

    override init() {
        super.init()
        preloadSounds()
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        #if targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--watch-auto-countdown") {
            DispatchQueue.main.async { self.start() }
        }
        if ProcessInfo.processInfo.arguments.contains("--watch-auto-send") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.send() }
        }
        #endif
    }
    func start() {
        timer?.invalidate()
        countdown.start(at: .now)
        remaining = 60
        countdownStatus = "Running"
        if sceneIsActive || workoutIsActive { startTimer() }
    }
    func cancel() {
        timer?.invalidate()
        timer = nil
        countdown.cancel()
        countdownStatus = "Cancelled"
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
        guard sceneIsActive || workoutIsActive, countdownStatus == "Running" else { return }
        tick(allowCue: false)
        if countdownStatus == "Running" { startTimer() }
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
    private func playSound(at seconds: Int) {
        guard soundEnabled else { return }
        let player = seconds == 0 ? zeroBeep : shortBeep
        guard let player else { return }
        player.currentTime = 0
        if player.play() { NSLog("Watch feasibility: audio request %d", seconds) }
    }
    private func tick(allowCue: Bool) {
        guard let result = countdown.update(at: .now, allowCue: allowCue) else { return }
        remaining = result.remaining
        if let seconds = result.cue {
            NSLog("Watch feasibility: haptic request %d", seconds)
            WKInterfaceDevice.current().play(seconds == 0 ? .success : .click)
            playSound(at: seconds)
        }
        if result.remaining == 0 {
            timer?.invalidate()
            timer = nil
            countdownStatus = "Complete"
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
    @StateObject private var workout = SailingWorkout()
    #endif
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            NavigationStack {
            ScrollView {
              VStack {
                #if WATCH_TEST_CANDIDATE
                if workout.active { Text("Workout active").font(.caption) }
                #endif
                Text(String(format: "%02d:%02d", experiment.remaining / 60, experiment.remaining % 60)).font(.system(size: 42, weight: .bold, design: .monospaced))
                Button("Start 1 min") { experiment.start() }
                Button("Cancel") { experiment.cancel() }
                Toggle("Sound cues", isOn: $experiment.soundEnabled)
                Text(experiment.countdownStatus).font(.caption2)
                Button("Send test") { experiment.send() }
                Text(experiment.status).font(.caption)
                #if WATCH_TEST_CANDIDATE
                NavigationLink(workout.active ? "Workout active" : "Sailing workout") {
                    SailingWorkoutView(workout: workout)
                }
                #endif
              }
            }
            .focusable(true)
            .onAppear { experiment.setActive(scenePhase == .active) }
            .onChange(of: scenePhase) { _, phase in experiment.setActive(phase == .active) }
            #if WATCH_TEST_CANDIDATE
            .onChange(of: workout.active) { _, active in experiment.setWorkoutActive(active) }
            #endif
            }
        }
    }
}
#else
@main struct WatchFeasibilityApp: App {
    var body: some Scene { WindowGroup { Text("Unavailable") } }
}
#endif
