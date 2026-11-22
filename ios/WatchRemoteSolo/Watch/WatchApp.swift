import SwiftUI
#if DEBUG && !WATCH_REMOTE_TEST
import OSLog
#endif
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

// One interaction owns the press from touch-down to release. A canceled or
// completed interaction cannot dispatch a second action.
struct RemotePress {
    private(set) var startedAt: TimeInterval?
    private(set) var thresholdSignaled = false
    mutating func begin(at time: TimeInterval) { guard startedAt == nil else { return }; startedAt = time; thresholdSignaled = false }
    mutating func update(at time: TimeInterval) -> Bool {
        guard let start = startedAt, !thresholdSignaled, time - start >= 2 else { return false }
        thresholdSignaled = true
        return true
    }
    mutating func cancel() { startedAt = nil; thresholdSignaled = false }
    mutating func updateLocation(isInside: Bool) { if !isInside { cancel() } }
    mutating func release(at time: TimeInterval, primary: Action) -> Action? {
        guard let start = startedAt else { return nil }
        let duration = time - start
        cancel()
        guard duration >= 0 else { return nil }
        return duration >= 2 ? .reset : primary
    }
}

final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    let mode = "remote"
    @Published var phase: Phase = .ready
    @Published var status = "Ej tillgänglig"
    @Published private var requestGate = RemoteRequestGate()
    var pending: Bool { requestGate.pending }
    var available: Bool { !pending && status == "Ansluten" && generation != nil && io.isReachable() }
    var primaryAction: Action { phase == .ready ? .start : phase == .running ? .pause : .resume }
    var primaryLabel: String { phase == .ready ? "START" : phase == .running ? "PAUSA" : "FORTSÄTT" }
    @Published var solo: CountdownState
    @Published var remaining: Int
    private let io: RemoteIO
    private let defaults: UserDefaults
    private var generation: String?
    private var timer: Timer?
    private var revisions = ControlRevisionGate()
    private var queryToken: UUID?
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
        if mode == "solo" { timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tickSolo() } }

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
    private func tickSolo() {
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
    private func applyLatest() {
        guard let snapshot = revisions.snapshot else { return }
        generation = snapshot.generation
        if phase != snapshot.phase { phase = snapshot.phase }
    }
    // A query has its own token: it never completes or invalidates a command.
    func refresh() {
        guard mode == "remote", io.isReachable() else {
            queryToken = nil; generation = nil; status = "Ej tillgänglig"; return
        }
        guard queryToken == nil else { return }
        let token = UUID(); queryToken = token
        if status != "Ansluten" && !pending { status = "Ansluter" }
        io.send(["kind": "query"], { reply in self.io.deliver {
            guard self.queryToken == token, let snapshot = ControlSnapshot.parse(reply) else { return }
            self.queryToken = nil
            if self.revisions.isRetired(snapshot.epoch) {
                self.generation = nil; self.status = "Ej tillgänglig"; return
            }
            _ = self.revisions.establish(snapshot)
            if !self.pending { self.applyLatest(); self.status = "Ansluten" }
        } }, { _ in self.io.deliver { self.queryFailed(token) } })
        io.schedule { self.queryFailed(token) }
    }
    private func queryFailed(_ token: UUID) {
        guard queryToken == token else { return }
        queryToken = nil
        if !pending { generation = nil; status = "Ej tillgänglig" }
    }
    func receiveState(_ message: [String: Any]) {
        guard mode == "remote", let snapshot = ControlSnapshot.parse(message) else { return }
        guard let current = revisions.snapshot, current.epoch == snapshot.epoch else {
            if revisions.isRetired(snapshot.epoch) { return }
            // Invalidate an earlier query that might predate the new authority.
            queryToken = nil
            if !pending { generation = nil; status = "Ej tillgänglig" }
            refresh(); return
        }
        guard revisions.accept(snapshot) else { return }
        // A push is never a command acknowledgement. Retain it until the reply.
        if !pending && status == "Ansluten" { applyLatest() }
        else if !pending {
            // A recovered phone announces a fresh revision. Confirm it through
            // a new query; an earlier query may have preceded recovery.
            queryToken = nil
            refresh()
        }
    }
    func command(_ action: Action) {
        guard mode == "remote", available, let generation else { return }
        let token = requestGate.begin(), id = UUID().uuidString; status = "Väntar"
        io.send(["kind": "command", "id": id, "generation": generation, "action": action.rawValue], { reply in self.io.deliver {
            guard self.requestGate.accepts(token, mode: self.mode), reply["id"] as? String == id,
                  let ok = reply["ok"] as? Bool, let snapshot = ControlSnapshot.parse(reply) else { return }
            guard self.requestGate.complete(token, mode: self.mode) else { return }
            guard self.revisions.snapshot?.epoch == snapshot.epoch else {
                self.generation = nil; self.status = "Ej tillgänglig"; self.refresh(); return
            }
            _ = self.revisions.accept(snapshot)
            self.applyLatest(); self.status = ok ? "Ansluten" : "Avvisad"
            if !ok { self.refresh() }
        } }, { _ in self.io.deliver { self.uncertain(token) } })
        io.schedule { self.uncertain(token) }
    }
    private func uncertain(_ token: UUID) {
        guard requestGate.accepts(token, mode: mode) else { return }
        requestGate.invalidate(); queryToken = nil; generation = nil; status = "Ej tillgänglig"
        refresh()
    }
    func foreground() { if mode == "remote" { refresh() } }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        io.deliver { if self.mode == "remote" { self.refresh() } }
    }
    func sessionReachabilityDidChange(_ session: WCSession) { io.deliver { self.reachabilityChanged() } }
    func reachabilityChanged() {
        guard mode == "remote" else { return }
        if !io.isReachable() {
            requestGate.invalidate(); queryToken = nil; generation = nil; status = "Ej tillgänglig"
        } else { refresh() }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        io.deliver { self.receiveState(message) }
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        io.deliver { self.receiveState(applicationContext) }
    }

}

#if !WATCH_REMOTE_TEST
@main struct WatchApp: App {
    @StateObject private var model = WatchModel()
    var body: some Scene { WindowGroup { NavigationStack { RemoteControlView(model: model) } } }
}

struct RemoteControlView: View {
    @ObservedObject var model: WatchModel
    @Environment(\.scenePhase) private var scenePhase
    @GestureState private var touching = false
    @State private var press = RemotePress()
    @State private var progress = 0.0
    @State private var capturedAction: Action?
    @State private var touchConsumed = false
    @State private var pressTimer: Timer?
    #if DEBUG
    @State private var loggedNearThreshold = false
    #endif

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }
    private func trace(_ event: String) {
        #if DEBUG
        Logger(subsystem: "se.tackwise.watchtest", category: "RemotePress").notice("\(event, privacy: .public)")
        #endif
    }
    private func cancelPress(_ reason: String = "cancel") {
        if press.startedAt != nil { trace("cancel: " + reason) }
        pressTimer?.invalidate(); pressTimer = nil
        press.cancel(); capturedAction = nil; progress = 0
        #if DEBUG
        loggedNearThreshold = false
        #endif
    }
    private func beginPress() {
        guard !touchConsumed else { return }
        touchConsumed = true
        guard model.available else { trace("begin unavailable"); return }
        trace("begin " + model.phase.rawValue)
        capturedAction = model.primaryAction
        press.begin(at: now)
        let timer = Timer(timeInterval: 0.05, repeats: true) { _ in
            guard model.available, let start = press.startedAt else { cancelPress("timer unavailable or missing press"); return }
            let time = now
            progress = min(1, max(0, (time - start) / 2))
            #if DEBUG
            if time - start >= 1.9 && !loggedNearThreshold {
                loggedNearThreshold = true
                trace("near threshold; elapsed milliseconds " + String(Int((time - start) * 1000)))
            }
            #endif
            if press.update(at: time) { trace("threshold; requesting haptic"); WKInterfaceDevice.current().play(.click) }
        }
        pressTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }
    private func endPress() {
        guard model.available, let action = capturedAction else { cancelPress("release unavailable or missing action"); return }
        let result = press.release(at: now, primary: action)
        trace("release " + (result?.rawValue ?? "no action"))
        cancelPress()
        if let result { model.command(result) }
    }
    var body: some View {
        VStack(spacing: 6) {
            Text(model.status).font(.caption).accessibilityIdentifier("remoteStatus")
            GeometryReader { geometry in
              ZStack {
                RoundedRectangle(cornerRadius: 18)
                    .fill(model.phase == .running ? Color.red : Color.green)
                VStack(spacing: 8) {
                    Text(model.primaryLabel).font(.headline)
                    if press.startedAt != nil {
                        ProgressView(value: progress).tint(.white)
                        Text("Håll för AVSLUTA").font(.caption2)
                    }
                }.foregroundStyle(.white).padding(10)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(model.available ? 1 : 0.45)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0)
                .updating($touching) { _, state, _ in state = true }
                .onChanged { value in
                    beginPress()
                    if !CGRect(origin: .zero, size: geometry.size).contains(value.location) {
                        press.updateLocation(isInside: false)
                        trace("drag outside")
                        cancelPress("drag outside")
                    }
                }
                .onEnded { value in
                    if !CGRect(origin: .zero, size: geometry.size).contains(value.location) {
                        press.updateLocation(isInside: false)
                        trace("drag outside")
                        cancelPress("drag outside")
                    } else { endPress() }
                })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(model.primaryLabel)
            .accessibilityValue(model.status)
            .accessibilityHint("Håll i två sekunder för att avsluta nedräkningen")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("remoteControl")
            .accessibilityAction { if model.available { model.command(model.primaryAction) } }
            .accessibilityAction(named: Text("AVSLUTA nedräkning")) { if model.available { model.command(.reset) } }
            }
        }
        .onChange(of: touching) { _, active in
            if !active { DispatchQueue.main.async { if !touching { trace("touch ended or canceled"); cancelPress("touch ended or canceled"); touchConsumed = false } } }
        }
        .onChange(of: model.available) { _, available in if !available { cancelPress("availability changed") } }
        .onChange(of: model.phase) { _, _ in cancelPress("phase changed") }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { cancelPress("scene inactive") } else { model.foreground() }
        }
        .onDisappear { cancelPress("view disappeared") }
    }
}
#endif
