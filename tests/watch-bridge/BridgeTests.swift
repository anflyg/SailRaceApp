import Foundation
import Capacitor
import WatchConnectivity

@main struct BridgeTests {
    static func wait(_ predicate: () -> Bool, timeout: TimeInterval = 4) {
        let limit = Date().addingTimeInterval(timeout)
        while !predicate() && Date() < limit { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }
        precondition(predicate(), "timed out waiting for bridge")
    }
    static func main() {
        let bridge = WatchCountdownPlugin(); bridge.load()
        var events: [(String, [String: Any])] = []
        CAPPlugin.onNotify = { events.append(($0, $1)) }
        func invoke(_ method: (CAPPluginCall) -> Void, _ values: [String: Any] = [:]) -> CAPPluginCall {
            let call = CAPPluginCall(values); method(call); wait { call.resolved || call.rejected }; return call
        }
        func query() -> [String: Any] {
            var response: [String: Any]?
            bridge.session(.default, didReceiveMessage: ["kind": "query"]) { response = $0 }
            wait { response != nil }; return response!
        }
        func send(_ id: String, _ action: String, _ generation: String, _ reply: @escaping ([String: Any]) -> Void) {
            bridge.session(.default, didReceiveMessage: ["kind": "command", "id": id, "action": action, "generation": generation], replyHandler: reply)
        }
        precondition(invoke(bridge.available, ["phase": "ready"]).resolved)
        let initial = query(), gen = initial["generation"] as! String, id = UUID().uuidString
        var first: [String: Any]?, duplicate: [String: Any]?
        send(id, "start", gen) { first = $0 }
        wait { events.filter { $0.0 == "command" }.count == 1 }
        send(id, "start", gen) { duplicate = $0 }
        wait { duplicate != nil }; precondition(duplicate?["ok"] as? Bool == false)
        precondition(invoke(bridge.confirm, ["id": id, "phase": "running"]).resolved)
        wait { first != nil }; precondition(first?["ok"] as? Bool == true)
        var repeated: [String: Any]?
        send(id, "start", gen) { repeated = $0 }
        wait { repeated != nil }; precondition(repeated?["ok"] as? Bool == true)
        precondition(events.filter { $0.0 == "command" }.count == 1)
        var collision: [String: Any]?
        send(id, "reset", gen) { collision = $0 }
        wait { collision != nil }; precondition(collision?["ok"] as? Bool == false)
        let timeoutId = UUID().uuidString
        var timedOut: [String: Any]?
        send(timeoutId, "pause", gen) { timedOut = $0 }
        wait { timedOut != nil }
        precondition(timedOut?["ok"] as? Bool == false)
        precondition(query()["kind"] == nil)
        wait { events.contains { $0.0 == "resync" } }
        precondition(invoke(bridge.confirm, ["id": timeoutId, "phase": "paused"]).rejected)
        precondition(invoke(bridge.available, ["phase": "paused"]).resolved)
        let recovered = query()
        precondition(recovered["phase"] as? String == "paused")
        precondition((recovered["revision"] as! Int) > (initial["revision"] as! Int))
        var stale: [String: Any]?
        send(UUID().uuidString, "resume", gen) { stale = $0 }
        wait { stale != nil }; precondition(stale?["ok"] as? Bool == false)
        let newGen = recovered["generation"] as! String
        let disconnectId = UUID().uuidString
        var disconnected: [String: Any]?
        send(disconnectId, "resume", newGen) { disconnected = $0 }
        wait { events.filter { $0.0 == "command" }.count == 3 }
        WCSession.default.isReachable = false
        bridge.sessionReachabilityDidChange(.default)
        wait { disconnected != nil }; precondition(disconnected?["ok"] as? Bool == false)
        let resyncs = events.filter { $0.0 == "resync" }.count
        WCSession.default.isReachable = true
        bridge.sessionReachabilityDidChange(.default)
        precondition(query()["kind"] == nil)
        wait { events.filter { $0.0 == "resync" }.count > resyncs }
        precondition(invoke(bridge.available, ["phase": "running"]).resolved)
        precondition(query()["phase"] as? String == "running")
        precondition(events.filter { $0.0 == "command" }.count == 3, "uncertain commands must not replay")
        let lastGeneration = query()["generation"] as! String
        var third: [String: Any]?
        send(UUID().uuidString, "pause", lastGeneration) { third = $0 }
        wait { events.filter { $0.0 == "command" }.count == 4 }
        WCSession.default.isReachable = false
        bridge.sessionReachabilityDidChange(.default)
        wait { third != nil }
        let beforeUnregister = events.filter { $0.0 == "resync" }.count
        precondition(invoke(bridge.unavailable).resolved)
        RunLoop.main.run(until: Date().addingTimeInterval(2.1))
        precondition(events.filter { $0.0 == "resync" }.count == beforeUnregister, "unmounted React must not be reactivated")
        precondition(query()["kind"] == nil)
        print("Native Watch bridge timeout and reconnect tests passed")
    }
}
