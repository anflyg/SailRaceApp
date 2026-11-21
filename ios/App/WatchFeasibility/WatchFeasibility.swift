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
    #if WATCH_TEST_CANDIDATE
    @Published private(set) var syncStatus = "UNCONFIRMED"
    private var syncSession: String?
    private var syncRevision: Int?
    private var syncGeneration = 0
    private var syncCheck: Timer?
    private var lastSyncConfirmed: ContinuousClock.Instant?
    private var pendingSyncRollback: (() -> Void)?
    #endif

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
        #if WATCH_TEST_CANDIDATE
        if syncStatus == "PENDING" { solo() }
        #endif
        guard countdown.selectPreset(minutes) else { return }
        presetMinutes = countdown.presetMinutes
        remaining = countdown.presetSeconds
        presetStore.save(presetMinutes)
    }
    @discardableResult func start() -> Bool {
        #if WATCH_TEST_CANDIDATE
        if syncStatus == "PENDING" { solo() }
        #endif
        guard phase == .ready else { return false }
        finishTask?.cancel()
        countdown.start(at: .now)
        phase = .running
        remaining = countdown.presetSeconds
        updateExecution()
        #if WATCH_TEST_CANDIDATE
        syncCommand("start", seconds: countdown.presetSeconds)
        #endif
        return true
    }
    func pauseOrResume() {
        #if WATCH_TEST_CANDIDATE
        if syncStatus == "PENDING" { solo() }
        #endif
        let now = ContinuousClock.now
        if phase == .running {
            if countdown.pause(at: now) {
                phase = .paused
                remaining = countdown.remaining(at: now)
                timer?.invalidate(); timer = nil
                #if WATCH_TEST_CANDIDATE
                syncCommand("pause")
                #endif
            } else { tick(allowCue: false) }
        } else if phase == .paused, countdown.resume(at: now) {
            phase = .running
            updateExecution()
            #if WATCH_TEST_CANDIDATE
            solo()
            #endif
        }
    }
    func skip() {
        #if WATCH_TEST_CANDIDATE
        if syncStatus == "PENDING" { solo() }
        #endif
        let now = ContinuousClock.now
        if countdown.skip(at: now) {
            remaining = countdown.remaining(at: now)
            #if WATCH_TEST_CANDIDATE
            solo()
            #endif
        }
        else if phase == .running { tick(allowCue: false) }
    }
    var canSkip: Bool { phase == .running && countdown.remaining(at: .now) > 60 }
    func cancel() {
        #if WATCH_TEST_CANDIDATE
        if syncStatus == "PENDING" { solo() }
        #endif
        finishTask?.cancel(); finishTask = nil
        timer?.invalidate(); timer = nil
        countdown.cancel()
        phase = .ready
        remaining = countdown.presetSeconds
        #if WATCH_TEST_CANDIDATE
        solo()
        #endif
    }
    func setActive(_ active: Bool) {
        sceneIsActive = active
        #if WATCH_TEST_CANDIDATE
        if active { enforceSyncFreshness() }
        #endif
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
        #if WATCH_TEST_CANDIDATE
        enforceSyncFreshness()
        #endif
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
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        #if WATCH_TEST_CANDIDATE
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if activationState == .activated && session.isReachable && self.syncStatus == "UNCONFIRMED" && self.phase == .ready { self.refreshSync(explicit: false) }
        }
        #endif
    }
    #if WATCH_TEST_CANDIDATE
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if !session.isReachable {
                if self.syncStatus != "UNCONFIRMED" || self.phase != .ready { self.solo() }
            }
            else if self.syncStatus == "UNCONFIRMED" && self.phase == .ready { self.refreshSync(explicit: false) }
        }
    }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard message.count == 7, message["kind"] as? String == "watch-sync-changed", syncInteger(message["version"]) == 1,
              message["origin"] as? String == "phone", let id = message["commandId"] as? String, UUID(uuidString: id) != nil,
              let sessionID = message["session"] as? String, UUID(uuidString: sessionID) != nil,
              let revision = syncInteger(message["revision"]), (0...1_000_000).contains(revision),
              let state = message["state"] as? String, ["ready", "running", "paused", "finished"].contains(state) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.syncStatus == "SHARED" || (self.syncStatus == "UNCONFIRMED" && self.phase == .ready) else { return }
            self.refreshSync(explicit: false)
        }
    }
    private func solo() {
        let oldSession = syncSession
        let notifyPhone = syncStatus == "SHARED" || syncStatus == "PENDING"
        syncCheck?.invalidate(); syncCheck = nil; syncGeneration += 1; syncStatus = "SOLO"
        let rollback = pendingSyncRollback; pendingSyncRollback = nil
        rollback?()
        if notifyPhone, let oldSession, WCSession.default.isReachable {
            WCSession.default.sendMessage(["kind": "watch-sync-test", "version": 1, "origin": "watch",
                "commandId": UUID().uuidString, "action": "solo", "session": oldSession], replyHandler: { _ in }, errorHandler: { _ in })
        }
    }
    private func enforceSyncFreshness() {
        guard syncStatus == "SHARED" || syncStatus == "PENDING", let last = lastSyncConfirmed else { return }
        if ContinuousClock.now > last.advanced(by: .seconds(6)) { solo() }
    }

    private func request(_ payload: [String: Any], generation: Int, completion: @escaping (TestSyncSnapshot, Duration) -> Void) {
        guard WCSession.default.activationState == .activated, WCSession.default.isReachable else { solo(); return }
        let id = UUID().uuidString
        var message = payload
        message["kind"] = "watch-sync-test"; message["version"] = 1
        message["origin"] = "watch"; message["commandId"] = id
        let sent = ContinuousClock.now
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            guard let self, self.syncGeneration == generation else { return }
            self.solo()
        }
        WCSession.default.sendMessage(message, replyHandler: { [weak self] reply in
            DispatchQueue.main.async {
                let received = ContinuousClock.now
                guard let self, self.syncGeneration == generation else { return }
                guard reply["commandId"] as? String == id, let snapshot = TestSyncSnapshot(reply),
                      snapshot.correlatedRemaining(roundTrip: self.elapsed(sent.duration(to: received))) != nil else { self.solo(); return }
                completion(snapshot, sent.duration(to: received))
            }
        }, errorHandler: { [weak self] _ in DispatchQueue.main.async {
            guard let self, self.syncGeneration == generation else { return }; self.solo()
        } })
    }
    private func syncCommand(_ action: String, seconds: Int = 0) {
        enforceSyncFreshness()
        guard syncStatus == "SHARED", let session = syncSession, let revision = syncRevision else { solo(); return }
        syncCheck?.invalidate(); syncCheck = nil
        syncGeneration += 1; let generation = syncGeneration; syncStatus = "PENDING"
        request(["action": "snapshot"], generation: generation) { [weak self] snapshot, _ in
            guard let self, snapshot.session == session, snapshot.revision == revision,
                  (action == "start" ? ["ready", "finished"].contains(snapshot.state) : snapshot.state == "running") else { self?.solo(); return }
            self.syncGeneration += 1; let commandGeneration = self.syncGeneration
            self.request(["action": action, "session": session, "revision": revision, "lease": snapshot.lease, "seconds": seconds], generation: commandGeneration) { [weak self] reply, rtt in
                guard let self, reply.session == session, reply.revision == revision + 1,
                      reply.state == (action == "start" ? "running" : "paused") else { self?.solo(); return }
                self.applySnapshot(reply, roundTrip: rtt, explicit: false)
            }
        }
    }
    func rejoinPhone() { refreshSync(explicit: true) }
    private func refreshSync(explicit: Bool) {
        guard explicit || syncStatus != "SOLO" else { return }
        if explicit {
            if syncStatus == "PENDING" { solo() }
            lastSyncConfirmed = nil
        }
        syncCheck?.invalidate(); syncCheck = nil
        syncGeneration += 1; let generation = syncGeneration; syncStatus = "PENDING"
        request(["action": "snapshot"], generation: generation) { [weak self] snapshot, rtt in
            guard let self else { return }
            if !explicit, let oldSession = self.syncSession, let oldRevision = self.syncRevision,
               (snapshot.session != oldSession || snapshot.revision < oldRevision || snapshot.revision > oldRevision + 1) { self.solo(); return }
            self.applySnapshot(snapshot, roundTrip: rtt, explicit: explicit)
        }
    }
    private func elapsed(_ duration: Duration) -> Double {
        let c = duration.components
        return Double(c.seconds) + Double(c.attoseconds) / 1e18
    }
    private func applySnapshot(_ snapshot: TestSyncSnapshot, roundTrip: Duration, explicit: Bool) {
        guard let seconds = snapshot.correlatedRemaining(roundTrip: elapsed(roundTrip)) else { solo(); return }
        let correlated = Duration.milliseconds(Int64(seconds * 1000))
        let now = ContinuousClock.now
        let localState: String
        switch phase {
        case .ready: localState = "ready"
        case .running: localState = "running"
        case .paused: localState = "paused"
        case .finished: localState = "finished"
        }
        guard TestSyncReconciliation.compatible(localState: localState, localSeconds: Double(countdown.remaining(at: now)),
                                               remoteState: snapshot.state, remoteSeconds: seconds, explicit: explicit) else { solo(); return }
        let priorCountdown = countdown
        let priorPhase = phase
        let priorRemaining = remaining
        lastSyncConfirmed = now
        if snapshot.state == "running" || snapshot.state == "paused" {
            guard correlated > .zero else { solo(); return }
            countdown.adopt(remaining: correlated, running: snapshot.state == "running", at: now)
            phase = snapshot.state == "running" ? .running : .paused
            remaining = countdown.remaining(at: now)
            updateExecution()
        } else if phase != .ready {
            if !explicit { solo(); return }
            timer?.invalidate(); timer = nil; countdown.cancel(); phase = .ready; remaining = countdown.presetSeconds
        }
        syncSession = snapshot.session; syncRevision = snapshot.revision
        syncGeneration += 1; let generation = syncGeneration; syncStatus = "PENDING"
        pendingSyncRollback = { [weak self] in
            guard let self else { return }
            self.finishTask?.cancel(); self.finishTask = nil
            self.countdown = priorCountdown; self.phase = priorPhase; self.remaining = priorRemaining
            self.updateExecution()
        }
        let rollback: () -> Void = { [weak self] in
            guard let self, self.syncGeneration == generation else { return }
            self.solo()
        }
        guard WCSession.default.isReachable else { rollback(); return }
        let ackID = UUID().uuidString
        DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: rollback)
        WCSession.default.sendMessage(["kind": "watch-sync-test", "version": 1, "origin": "watch",
            "commandId": ackID, "action": "ack", "session": snapshot.session,
            "revision": snapshot.revision, "state": snapshot.state], replyHandler: { [weak self] reply in
                DispatchQueue.main.async {
                    guard let self, self.syncGeneration == generation else { return }
                    guard reply["ok"] as? Bool == true, reply["acknowledged"] as? Bool == true,
                          reply["commandId"] as? String == ackID, syncInteger(reply["revision"]) == snapshot.revision else { rollback(); return }
                    self.pendingSyncRollback = nil
                    self.syncGeneration += 1; self.syncStatus = "SHARED"; self.lastSyncConfirmed = .now
                    if WCSession.default.isReachable {
                        WCSession.default.sendMessage(["kind": "watch-sync-test", "version": 1, "origin": "watch",
                            "commandId": UUID().uuidString, "action": "confirm", "session": snapshot.session,
                            "revision": snapshot.revision, "state": snapshot.state], replyHandler: { _ in }, errorHandler: { _ in })
                    }
                    let check = Timer(timeInterval: 5, repeats: false) { [weak self] _ in
                        guard let self, self.syncStatus == "SHARED" else { return }
                        self.refreshSync(explicit: false)
                    }
                    RunLoop.main.add(check, forMode: .common)
                    self.syncCheck = check
                }
            }, errorHandler: { [weak self] _ in DispatchQueue.main.async {
                guard let self, self.syncGeneration == generation else { return }; rollback()
            } })
    }
    #endif
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
    private func startCountdown() {
        #if WATCH_TEST_CANDIDATE
        AutomaticWorkoutPolicy.startCountdown({ experiment.start() }) { workout.countdownStarted() }
        #else
        experiment.start()
        #endif
    }

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
                                        if experiment.phase == .ready { startCountdown() }
                                        else { experiment.pauseOrResume() }
                                    }
                                })
                                .accessibilityAddTraits(.isButton)
                                .accessibilityAction { if experiment.phase == .ready { startCountdown() } else { experiment.pauseOrResume() } }
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
                .alert("Sailing workout", isPresented: Binding(
                    get: { workout.automaticWarning != nil },
                    set: { if !$0 { workout.automaticWarning = nil } }
                )) {
                    Button("OK", role: .cancel) { workout.automaticWarning = nil }
                } message: {
                    Text(workout.automaticWarning ?? "")
                }
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
                                Text("Sync: \(experiment.syncStatus)")
                                Button("Rejoin phone countdown") { experiment.rejoinPhone() }
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
