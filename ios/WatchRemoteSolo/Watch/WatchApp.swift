import SwiftUI
import WatchConnectivity
import WatchKit
import AVFoundation

final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var mode: String
    @Published var phase: Phase = .ready
    @Published var status = "Ej tillgänglig"
    @Published var pending = false
    @Published var solo: CountdownState
    @Published var remaining: Int
    private var generation: String?
    private var request = UUID()
    private var timer: Timer?
    private var refreshTicks = 0
    private var players: [String: AVAudioPlayer] = [:]
    override init() {
        let savedMode = UserDefaults.standard.string(forKey: "watchMode")
        mode = savedMode == "solo" ? "solo" : "remote"
        let preset = CountdownPresetStore(defaults: .standard).load()
        solo = CountdownState(presetMinutes: preset); remaining = preset * 60
        super.init()
        for name in ["CountdownShort", "CountdownZero"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "wav"), let player = try? AVAudioPlayer(contentsOf: url) { players[name] = player; player.prepareToPlay() }
        }
        if mode == "remote", WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.tick() }
    }
    func select(_ newMode: String) {
        guard newMode != mode else { return }
        if mode == "solo" { solo.cancel(); remaining = solo.presetSeconds }
        request = UUID(); pending = false; generation = nil; status = "Ej tillgänglig"
        mode = newMode; UserDefaults.standard.set(mode, forKey: "watchMode")
        if mode == "remote", WCSession.isSupported() {
            WCSession.default.delegate = self
            if WCSession.default.activationState == .activated { refresh() } else { WCSession.default.activate() }
        }
    }
    func selectPreset(_ value: Int) { if solo.selectPreset(value) { remaining = solo.presetSeconds; CountdownPresetStore(defaults: .standard).save(value) } }
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
            WKInterfaceDevice.current().play(cue.haptic == .success ? .success : .click)
            let player = players[cue.sound == .zero ? "CountdownZero" : "CountdownShort"]
            player?.currentTime = 0; player?.play()
        }
    }
    func refresh() {
        guard mode == "remote", WCSession.default.isReachable else { status = "Ej tillgänglig"; generation = nil; return }
        let token = UUID(); request = token; pending = true; status = "Ansluter"
        WCSession.default.sendMessage(["kind": "query"], replyHandler: { reply in DispatchQueue.main.async {
            guard self.mode == "remote", self.request == token, let generation = reply["generation"] as? String,
                  let raw = reply["phase"] as? String, let phase = Phase(rawValue: raw) else { return }
            self.generation = generation; self.phase = phase; self.pending = false; self.status = "Ansluten"
        } }, errorHandler: { _ in DispatchQueue.main.async { self.fail(token) } })
        timeout(token)
    }
    func command(_ action: Action) {
        guard mode == "remote", !pending, let generation, WCSession.default.isReachable else { return }
        let token = UUID(), id = UUID().uuidString; request = token; pending = true; status = "Väntar"
        WCSession.default.sendMessage(["kind": "command", "id": id, "generation": generation, "action": action.rawValue], replyHandler: { reply in DispatchQueue.main.async {
            guard self.mode == "remote", self.request == token, reply["id"] as? String == id,
                  let ok = reply["ok"] as? Bool, let raw = reply["phase"] as? String, let phase = Phase(rawValue: raw) else { return }
            self.phase = phase; self.pending = false; self.status = ok ? "Ansluten" : "Avvisad"
        } }, errorHandler: { _ in DispatchQueue.main.async { self.uncertain(token) } })
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.uncertain(token) }
    }
    private func timeout(_ token: UUID) { DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.fail(token) } }
    private func fail(_ token: UUID) { guard mode == "remote", request == token, pending else { return }; request = UUID(); pending = false; generation = nil; status = "Ej tillgänglig" }
    private func uncertain(_ token: UUID) { guard mode == "remote", request == token, pending else { return }; fail(token); refresh() }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) { DispatchQueue.main.async { if self.mode == "remote" { self.refresh() } } }
    func sessionReachabilityDidChange(_ session: WCSession) { DispatchQueue.main.async { guard self.mode == "remote" else { return }; self.request = UUID(); self.pending = false; self.generation = nil; self.refresh() } }
}

@main struct WatchApp: App {
    @StateObject private var model = WatchModel()
    @State private var confirm = false
    var body: some Scene { WindowGroup { NavigationStack {
        VStack {
            if model.mode == "remote" {
                Text(model.status).font(.caption)
                Button(model.phase == .ready ? "START" : model.phase == .running ? "PAUSA" : "FORTSÄTT") { model.command(model.phase == .ready ? .start : model.phase == .running ? .pause : .resume) }
                    .tint(.blue).disabled(model.pending || model.status != "Ansluten")
                Button("AVSLUTA") { model.command(.reset) }.tint(.red).disabled(model.pending || model.status != "Ansluten")
            } else {
                Text(String(format: "%02d:%02d", model.remaining / 60, model.remaining % 60)).font(.title2.monospacedDigit())
                if model.solo.phase == .ready { Picker("Minuter", selection: Binding(get: { model.solo.presetMinutes }, set: { model.selectPreset($0) })) { ForEach(1...5, id: \.self) { Text("\($0) min").tag($0) } } }
                Button(model.solo.phase == .ready || model.solo.phase == .finished ? "START" : model.solo.phase == .running ? "PAUSA" : "FORTSÄTT") {
                    if model.solo.phase == .finished { model.soloAction(.reset) }
                    model.soloAction(model.solo.phase == .ready ? .start : model.solo.phase == .running ? .pause : .resume)
                }.tint(.blue)
                Button("AVSLUTA") { model.soloAction(.reset) }.tint(.red)
            }
        }.buttonStyle(.borderedProminent)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { List {
            Button("Fjärrkontroll") { if model.mode == "solo" && model.solo.phase == .running { confirm = true } else { model.select("remote") } }
            Button("SOLO") { model.select("solo") }
        }.confirmationDialog("Avsluta SOLO-nedräkningen?", isPresented: $confirm) { Button("Avsluta och byt", role: .destructive) { model.select("remote") } } } label: { Image(systemName: "ellipsis") } } }
    } } }
}
