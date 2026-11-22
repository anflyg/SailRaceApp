import Foundation
import Capacitor
import WatchConnectivity

// WatchConnectivity carries control phases only. React owns the actual countdown.
@objc(WatchCountdownPlugin)
public final class WatchCountdownPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchCountdownPlugin"
    public let jsName = "WatchCountdown"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unavailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise)
    ]
    private let epoch = UUID().uuidString
    private var generation = UUID().uuidString
    private var revision = 0
    private var phase = "ready"
    private var ready = false
    private var pending: (id: String, action: String, target: String, deadline: Date, reply: ([String: Any]) -> Void)?
    private var recoveryToken = UUID()
    private var replies: [String: (action: String, generation: String, ok: Bool)] = [:]
    private let phases = ["ready", "running", "paused"]
    private var snapshot: [String: Any] { ["kind": "state", "epoch": epoch, "generation": generation, "revision": revision, "phase": phase] }

    public override func load() {
        if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
    }
    private func fence() {
        if let p = pending { pending = nil; p.reply(["ok": false]) }
        generation = UUID().uuidString
        revision += 1
        replies.removeAll()
    }
    // Never restore availability until an old delivered command has expired.
    // The React view then reports its committed phase; no command is replayed.
    private func recoverAfterUncertainCommand() {
        guard let p = pending else { return }
        let delay = max(0, p.deadline.timeIntervalSinceNow)
        ready = false
        fence()
        let token = UUID()
        recoveryToken = token
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard !self.ready, self.recoveryToken == token else { return }
            self.notifyListeners("resync", data: [:])
        }
    }
    private func publish() {
        let session = WCSession.default
        guard ready, session.activationState == .activated else { return }
        let state = snapshot
        try? session.updateApplicationContext(state)
        if session.isReachable { session.sendMessage(state, replyHandler: nil, errorHandler: { _ in }) }
    }
    @objc func available(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let phase = call.getString("phase"), self.phases.contains(phase) else { call.reject("invalid phase"); return }
            self.recoveryToken = UUID(); self.fence(); self.phase = phase; self.ready = true; self.publish(); call.resolve()
        }
    }
    @objc func unavailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.recoveryToken = UUID(); self.ready = false; self.fence(); call.resolve() }
    }
    @objc func confirm(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.ready, let phase = call.getString("phase"), self.phases.contains(phase) else { call.reject("unavailable"); return }
            let id = call.getString("id")
            if let id {
                guard let p = self.pending, p.id == id, p.target == phase else { call.reject("stale command"); return }
                self.pending = nil
                if self.phase != phase { self.phase = phase; self.revision += 1 }
                self.replies[id] = (p.action, self.generation, true)
                self.publish()
                var response = self.snapshot; response["id"] = id; response["ok"] = true
                p.reply(response)
            } else if self.phase != phase {
                // A local transition races any pending remote command; do not acknowledge it.
                if self.pending != nil { self.recoverAfterUncertainCommand() }
                self.phase = phase; self.revision += 1; self.publish()
            }
            call.resolve()
        }
    }
    public func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { if state == .activated { self.publish() } }
    }
    public func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            if !session.isReachable {
                if self.pending != nil { self.recoverAfterUncertainCommand() } else { self.fence() }
            }
            self.publish()
        }
    }
    public func sessionDidBecomeInactive(_ session: WCSession) {
        DispatchQueue.main.async {
            if self.pending != nil { self.recoverAfterUncertainCommand() } else { self.fence() }
        }
    }
    public func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            guard self.ready else { replyHandler(["ok": false]); return }
            if message["kind"] as? String == "query" { replyHandler(self.snapshot); return }
            guard Set(message.keys) == Set(["kind", "id", "generation", "action"]),
                  message["kind"] as? String == "command", let id = message["id"] as? String, UUID(uuidString: id) != nil,
                  let generation = message["generation"] as? String, generation == self.generation,
                  let action = message["action"] as? String else { replyHandler(["ok": false]); return }
            if let prior = self.replies[id] {
                var response = self.snapshot; response["id"] = id
                response["ok"] = prior.generation == generation && prior.action == action && prior.ok
                replyHandler(response); return
            }
            guard self.pending == nil else { replyHandler(["ok": false]); return }
            let target: String
            switch (self.phase, action) {
            case ("ready", "start"), ("paused", "resume"): target = "running"
            case ("running", "pause"): target = "paused"
            case (_, "reset"): target = "ready"
            default: replyHandler(["ok": false]); return
            }
            let deadline = Date().addingTimeInterval(2)
            self.pending = (id, action, target, deadline, replyHandler)
            self.notifyListeners("command", data: ["id": id, "action": action, "expiresAt": deadline.timeIntervalSince1970 * 1000])
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                if self.pending?.id == id { self.recoverAfterUncertainCommand() }
            }
        }
    }
}
