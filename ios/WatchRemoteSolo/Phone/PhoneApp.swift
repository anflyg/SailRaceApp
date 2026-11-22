import SwiftUI
import WatchConnectivity
import AudioToolbox

final class PhoneModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var authority = Authority()
    @Published var remaining = 300
    @Published var preset = 5
    private var deadline: Date?
    private var timer: Timer?
    private var lastSecond = 301
    override init() {
        super.init()
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
    }
    private func tick() {
        guard authority.phase == .running, let deadline else { return }
        let next = max(0, Int(ceil(deadline.timeIntervalSinceNow)))
        if next != lastSecond && (0...5).contains(next) && next == lastSecond - 1 { AudioServicesPlaySystemSound(1104) }
        lastSecond = next
        remaining = next
        if next == 0 { _ = authority.execute(id: UUID().uuidString, generation: authority.generation, action: .reset); remaining = preset * 60; self.deadline = nil }
    }
    private func perform(_ action: Action, id: String, generation: String) -> (Bool, Phase) {
        let previous = authority.phase
        let reply = authority.execute(id: id, generation: generation, action: action)
        // Duplicate requests return the original result, but must not execute timer effects again.
        guard reply.0, reply.2, previous != authority.phase || (action == .reset && deadline != nil) else { return (reply.0, reply.1) }
        switch action {
        case .start: remaining = preset * 60; deadline = Date().addingTimeInterval(Double(remaining)); lastSecond = remaining
        case .pause: if let deadline { remaining = max(0, Int(ceil(deadline.timeIntervalSinceNow))) }; deadline = nil
        case .resume: deadline = Date().addingTimeInterval(Double(remaining)); lastSecond = remaining
        case .reset: deadline = nil; remaining = preset * 60
        }
        return (reply.0, reply.1)
    }
    func local(_ action: Action) { _ = perform(action, id: UUID().uuidString, generation: authority.generation) }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            guard let kind = message["kind"] as? String else { replyHandler(["ok": false]); return }
            if kind == "query" {
                let (generation, phase) = self.authority.refresh()
                replyHandler(["generation": generation, "phase": phase.rawValue]); return
            }
            guard let command = Command.parse(message) else { replyHandler(["ok": false]); return }
            let id = command.id
            let (ok, phase) = self.perform(command.action, id: id, generation: command.generation)
            replyHandler(["id": id, "ok": ok, "phase": phase.rawValue])
        }
    }
}

@main struct PhoneApp: App {
    @StateObject private var model = PhoneModel()
    var body: some Scene { WindowGroup {
        VStack(spacing: 20) {
            Text("Watch Test").font(.title)
            Text(String(format: "%02d:%02d", model.remaining / 60, model.remaining % 60)).font(.largeTitle.monospacedDigit())
            Picker("Minutes", selection: $model.preset) { ForEach(1...5, id: \.self) { Text("\($0) min").tag($0) } }.disabled(model.authority.phase != .ready)
                .onChange(of: model.preset) { value in model.remaining = value * 60 }
            Button(model.authority.phase == .ready ? "START" : model.authority.phase == .running ? "PAUSA" : "FORTSÄTT") {
                model.local(model.authority.phase == .ready ? .start : model.authority.phase == .running ? .pause : .resume)
            }.buttonStyle(.borderedProminent)
            Button("AVSLUTA", role: .destructive) { model.local(.reset) }
        }.padding()
    } }
}
