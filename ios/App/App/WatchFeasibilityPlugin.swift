#if WATCH_TEST_CANDIDATE || (DEBUG && WATCH_FEASIBILITY && targetEnvironment(simulator))
import Capacitor
import Foundation
import WatchConnectivity

// An intentionally bounded, test-only message; no race or personal data.
final class WatchFeasibilityReceiver: NSObject, WCSessionDelegate {
    static let shared = WatchFeasibilityReceiver()
    weak var plugin: WatchFeasibilityPlugin?
    private var pending: [String: ([String: Any]) -> Void] = [:]
    #if WATCH_TEST_CANDIDATE
    private var authority = TestSyncAuthority()
    private var watchAckRevision: Int?
    private var watchAckTime = 0.0

    func syncStatus() -> [String: Any] {
        var result = authority.snapshot(at: TestSyncClock.now, issueLease: false)
        result["reachable"] = WCSession.default.isReachable
        if let acknowledged = watchAckRevision, acknowledged == authority.revision, TestSyncClock.now - watchAckTime <= 6 { result["watchAckRevision"] = acknowledged }
        return result
    }

    func phoneAction(_ action: String, seconds: Int) -> [String: Any] {
        let accepted: Bool
        if action == "preset" { accepted = authority.selectPhonePreset(seconds) }
        else if action == "start" {
            accepted = seconds == authority.presetSeconds && authority.apply(kind: action, seconds: seconds, at: TestSyncClock.now)
        } else { accepted = authority.apply(kind: action, seconds: seconds, at: TestSyncClock.now) }
        if accepted { watchAckRevision = nil }
        if accepted && WCSession.default.isReachable {
            let current = syncStatus()
            WCSession.default.sendMessage(["kind": "watch-sync-changed", "version": 1, "origin": "phone",
                "commandId": UUID().uuidString, "session": authority.sessionID,
                "revision": authority.revision, "state": current["state"] ?? "ready"], replyHandler: nil, errorHandler: { _ in })
        }
        var result = syncStatus(); result["accepted"] = accepted
        return result
    }
    #endif

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.main.async {
            #if WATCH_TEST_CANDIDATE
            if message["kind"] as? String == "watch-sync-test" {
                let result = self.authority.handle(message, at: TestSyncClock.now)
                if result["confirmed"] as? Bool == true { self.watchAckRevision = result["revision"] as? Int; self.watchAckTime = TestSyncClock.now }
                else if result["solo"] as? Bool == true { self.watchAckRevision = nil }
                else if result["ok"] as? Bool == true && ["start", "pause"].contains(message["action"] as? String ?? "") { self.watchAckRevision = nil }
                replyHandler(result)
                self.plugin?.notifyListeners("syncChanged", data: self.syncStatus())
                return
            }
            #endif
            guard message["kind"] as? String == "watch-feasibility", let id = message["id"] as? String, UUID(uuidString: id) != nil, self.pending[id] == nil, let plugin = self.plugin else {
                replyHandler(["processed": false]); return
            }
            NSLog("Watch feasibility: native receipt")
            self.pending[id] = replyHandler
            plugin.notifyListeners("watchTest", data: ["id": id])
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { self.finish(id, processed: false) }
        }
    }
    func finish(_ id: String, processed: Bool) {
        guard let reply = pending.removeValue(forKey: id) else { return }
        NSLog(processed ? "Watch feasibility: JS confirmed" : "Watch feasibility: JS timeout")
        reply(["processed": processed])
    }
}

@objc(WatchFeasibilityPlugin)
public class WatchFeasibilityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchFeasibilityPlugin"
    public let jsName = "WatchFeasibility"
    #if WATCH_TEST_CANDIDATE
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncAction", returnType: CAPPluginReturnPromise)
    ]
    #else
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testMode", returnType: CAPPluginReturnPromise)
    ]
    #endif
    @objc func testMode(_ call: CAPPluginCall) {
        call.resolve(["listen": !ProcessInfo.processInfo.arguments.contains("--watch-no-listener")])
    }
    public override func load() { WatchFeasibilityReceiver.shared.plugin = self }
    #if WATCH_TEST_CANDIDATE
    @objc func syncStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(WatchFeasibilityReceiver.shared.syncStatus()) }
    }
    @objc func syncAction(_ call: CAPPluginCall) {
        guard let action = call.getString("action"), ["start", "pause", "preset"].contains(action) else { call.reject("Invalid action"); return }
        let seconds = call.getInt("seconds") ?? 0
        DispatchQueue.main.async { call.resolve(WatchFeasibilityReceiver.shared.phoneAction(action, seconds: seconds)) }
    }
    #endif
    @objc func confirm(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        DispatchQueue.main.async {
            WatchFeasibilityReceiver.shared.finish(id, processed: true)
            call.resolve()
        }
    }
}
#endif
