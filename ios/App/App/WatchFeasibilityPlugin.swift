#if DEBUG
import Capacitor
import Foundation
import WatchConnectivity

// An intentionally bounded, test-only message; no race or personal data.
final class WatchFeasibilityReceiver: NSObject, WCSessionDelegate {
    static let shared = WatchFeasibilityReceiver()
    weak var plugin: WatchFeasibilityPlugin?
    private var pending: [String: ([String: Any]) -> Void] = [:]

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
        reply(["processed": processed])
    }
}

@objc(WatchFeasibilityPlugin)
public class WatchFeasibilityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchFeasibilityPlugin"
    public let jsName = "WatchFeasibility"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise)]
    public override func load() { WatchFeasibilityReceiver.shared.plugin = self }
    @objc func confirm(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        DispatchQueue.main.async {
            WatchFeasibilityReceiver.shared.finish(id, processed: true)
            call.resolve()
        }
    }
}
#endif
