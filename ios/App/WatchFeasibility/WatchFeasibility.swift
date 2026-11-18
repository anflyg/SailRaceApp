import SwiftUI
#if DEBUG
import WatchKit
import WatchConnectivity

final class Experiment: NSObject, ObservableObject, WCSessionDelegate {
    @Published var status = "Not sent"
    @Published var remaining = 60
    private var deadline: TimeInterval?
    private var lastCue = 61
    private var timer: Timer?

    override init() {
        super.init()
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
        deadline = ProcessInfo.processInfo.systemUptime + 60
        remaining = 60
        lastCue = 61
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
    }
    private func tick() {
        guard let deadline = deadline else { return }
        let timeLeft = deadline - ProcessInfo.processInfo.systemUptime
        let seconds = max(0, Int(ceil(timeLeft)))
        remaining = seconds
        // Never replay missed cues when execution resumes late.
        if seconds <= 5 && seconds < lastCue && timeLeft >= Double(seconds) - 0.25 {
            NSLog("Watch feasibility: haptic request %d", seconds)
            WKInterfaceDevice.current().play(seconds == 0 ? .success : .click)
        }
        lastCue = seconds
        if seconds == 0 { timer?.invalidate(); self.deadline = nil }
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
    var body: some Scene {
        WindowGroup {
            VStack {
                Text(String(format: "%02d:%02d", experiment.remaining / 60, experiment.remaining % 60)).font(.system(size: 42, weight: .bold, design: .monospaced))
                Button("Start 1 min") { experiment.start() }
                Button("Send test") { experiment.send() }
                Text(experiment.status).font(.caption)
            }
        }
    }
}
#else
@main struct WatchFeasibilityApp: App {
    var body: some Scene { WindowGroup { Text("Unavailable") } }
}
#endif
