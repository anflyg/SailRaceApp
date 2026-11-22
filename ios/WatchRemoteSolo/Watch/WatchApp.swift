import SwiftUI
#if !WATCH_REMOTE_TEST
import WatchConnectivity
import WatchKit
#else
protocol WCSessionDelegate {}
enum WCSessionActivationState { case activated }
final class WCSession {
    static let `default` = WCSession()
    static func isSupported() -> Bool { false }
    var delegate: WCSessionDelegate?
    var activationState: WCSessionActivationState = .activated
    func activate() {}
}
#endif
import AVFoundation

struct RemoteIO {
    var isReachable: () -> Bool
    var send: ([String: Any], @escaping ([String: Any]) -> Void, @escaping (Error) -> Void) -> Void
    var schedule: (@escaping () -> Void) -> Void
    var deliver: (@escaping () -> Void) -> Void
}

final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    let mode = "remote"
    @Published var phase: Phase = .ready
    @Published var status = "Ej tillgänglig"
    @Published private var requestGate = RemoteRequestGate()
    var pending: Bool { requestGate.pending }
    @Published var solo: CountdownState
    @Published var remaining: Int
    private let io: RemoteIO
    private let defaults: UserDefaults
    private var generation: String?
    private var timer: Timer?
    private var refreshTicks = 0
    private var players: [String: AVAudioPlayer] = [:]
    #if !WATCH_REMOTE_TEST
    override convenience init() {
        self.init(io: RemoteIO(
            isReachable: { WCSession.default.isReachable },
            send: { message, reply, error in WCSession.default.sendMessage(message, replyHandler: reply, errorHandler: error) },
            schedule: { callback in DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: callback) },
            deliver: { callback in DispatchQueue.main.async(execute: callback) }
        ), defaults: .standard, startServices: true)
    }
    #endif
    init(io: RemoteIO, defaults: UserDefaults, startServices: Bool) {
        self.io = io
        self.defaults = defaults
        defaults.set("remote", forKey: "watchMode")
        let preset = CountdownPresetStore(defaults: defaults).load()
        solo = CountdownState(presetMinutes: preset); remaining = preset * 60
        super.init()
        guard startServices else { return }
        if mode == "remote", WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
    }
    func selectPreset(_ value: Int) { guard mode == "solo" else { return }; if solo.selectPreset(value) { remaining = solo.presetSeconds; CountdownPresetStore(defaults: defaults).save(value) } }
    func soloAction(_ action: Action) {
        guard mode == "solo" else { return }
        switch action {
        case .start: if solo.phase == .ready { solo.start(at: .now) }
        case .pause: _ = solo.pause(at: .now)
        case .resume: _ = solo.resume(at: .now)
        case .reset: solo.cancel()
        }
        remaining = solo.remaining(at: .now)
    }
    private func tick() {
        if mode == "remote" {
            refreshTicks += 1
            if refreshTicks >= 50 { refreshTicks = 0; if !pending { refresh() } }
            return
        }
        guard let update = solo.update(at: .now, allowCue: true) else { return }
        remaining = update.remaining
        if let second = update.cue, let cue = CountdownCueOutput.forSecond(second) {
            #if !WATCH_REMOTE_TEST
            WKInterfaceDevice.current().play(cue.haptic == .success ? .success : .click)
            #endif
            let player = players[cue.sound == .zero ? "CountdownZero" : "CountdownShort"]
            player?.currentTime = 0; player?.play()
        }
    }
    func refresh() {
        guard mode == "remote", io.isReachable() else { status = "Ej tillgänglig"; generation = nil; return }
        let token = requestGate.begin(); status = "Ansluter"
        io.send(["kind": "query"], { reply in self.io.deliver {
            guard self.requestGate.accepts(token, mode: self.mode), let generation = reply["generation"] as? String,
                  let raw = reply["phase"] as? String, let phase = Phase(rawValue: raw) else { return }
            guard self.requestGate.complete(token, mode: self.mode) else { return }
            self.generation = generation; self.phase = phase; self.status = "Ansluten"
        } }, { _ in self.io.deliver { self.fail(token) } })
        timeout(token)
    }
    func command(_ action: Action) {
        guard mode == "remote", !pending, let generation, io.isReachable() else { return }
        let token = requestGate.begin(), id = UUID().uuidString; status = "Väntar"
        io.send(["kind": "command", "id": id, "generation": generation, "action": action.rawValue], { reply in self.io.deliver {
            guard self.requestGate.accepts(token, mode: self.mode), reply["id"] as? String == id,
                  let ok = reply["ok"] as? Bool, let raw = reply["phase"] as? String, let phase = Phase(rawValue: raw) else { return }
            guard self.requestGate.complete(token, mode: self.mode) else { return }
            self.phase = phase; self.status = ok ? "Ansluten" : "Avvisad"
        } }, { _ in self.io.deliver { self.uncertain(token) } })
        io.schedule { self.uncertain(token) }
    }
    private func timeout(_ token: UUID) { io.schedule { self.fail(token) } }
    private func fail(_ token: UUID) { guard requestGate.accepts(token, mode: mode) else { return }; requestGate.invalidate(); generation = nil; status = "Ej tillgänglig" }
    private func uncertain(_ token: UUID) { guard requestGate.accepts(token, mode: mode) else { return }; fail(token); refresh() }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) { io.deliver { if self.mode == "remote" { self.refresh() } } }
    func sessionReachabilityDidChange(_ session: WCSession) { io.deliver { self.reachabilityChanged() } }
    func reachabilityChanged() { guard mode == "remote" else { return }; requestGate.invalidate(); generation = nil; refresh() }
}

#if !WATCH_REMOTE_TEST
@main struct WatchApp: App {
    @StateObject private var model = WatchModel()
    var body: some Scene { WindowGroup { NavigationStack {
        VStack {
            Text(model.status).font(.caption)
            Button(model.phase == .ready ? "START" : model.phase == .running ? "PAUSA" : "FORTSÄTT") { model.command(model.phase == .ready ? .start : model.phase == .running ? .pause : .resume) }
                .tint(.blue).disabled(model.pending || model.status != "Ansluten")
            Button("AVSLUTA") { model.command(.reset) }.tint(.red).disabled(model.pending || model.status != "Ansluten")
        }.buttonStyle(.borderedProminent)
    } } }
}

#endif
