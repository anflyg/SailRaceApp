import Foundation
import Darwin
import CoreFoundation

func syncInteger(_ value: Any?) -> Int? {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue.isFinite, number.doubleValue >= Double(Int32.min), number.doubleValue <= Double(Int32.max),
          number.doubleValue == Double(number.intValue) else { return nil }
    return number.intValue
}

enum TestSyncClock {
    static var now: Double {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(mach_continuous_time()) * Double(info.numer) / Double(info.denom) / 1e9
    }
}

// Isolated feasibility protocol. Values are durations, never device clock epochs.
struct TestSyncAuthority {
    let sessionID = UUID().uuidString
    private(set) var revision = 0
    private(set) var phase = "ready"
    private(set) var presetSeconds = 300
    private var deadline: Double?
    private var pausedMilliseconds = 0
    private var leaseID = ""
    private var leaseExpiry: Double?
    private var seen: Set<String> = []
    private var seenOrder: [String] = []

    mutating func snapshot(at now: Double, issueLease: Bool = true) -> [String: Any] {
        if phase == "running", remaining(at: now) == 0 { phase = "finished"; deadline = nil; revision += 1 }
        if issueLease { leaseID = UUID().uuidString; leaseExpiry = now + 2 }
        return ["version": 1, "session": sessionID, "revision": revision, "state": phase,
                "remainingMs": remaining(at: now), "lease": leaseID, "presetSeconds": presetSeconds]
    }
    private func remaining(at now: Double) -> Int {
        if phase == "paused" { return pausedMilliseconds }
        guard phase == "running", let deadline else { return 0 }
        return max(0, min(300_000, Int((deadline - now) * 1000)))
    }
    mutating func apply(kind: String, seconds: Int, at now: Double) -> Bool {
        _ = snapshot(at: now, issueLease: false)
        if kind == "start", (phase == "ready" || phase == "finished"), (60...300).contains(seconds), seconds % 60 == 0 {
            phase = "running"; deadline = now + Double(seconds); revision += 1; return true
        }
        if kind == "pause", phase == "running" {
            pausedMilliseconds = remaining(at: now)
            guard pausedMilliseconds > 0 else { return false }
            phase = "paused"; deadline = nil; revision += 1; return true
        }
        return false
    }
    mutating func selectPhonePreset(_ seconds: Int) -> Bool {
        guard (60...300).contains(seconds), seconds % 60 == 0 else { return false }
        if seconds != presetSeconds { presetSeconds = seconds; revision += 1 }
        return true
    }
    mutating func handle(_ message: [String: Any], at now: Double) -> [String: Any] {
        let allowedKeys: Set<String> = ["kind", "version", "commandId", "origin", "action", "session", "revision", "lease", "seconds", "state"]
        guard message.count <= 9, Set(message.keys).isSubset(of: allowedKeys), message["kind"] as? String == "watch-sync-test", syncInteger(message["version"]) == 1,
              let id = message["commandId"] as? String, UUID(uuidString: id) != nil,
              message["origin"] as? String == "watch", let action = message["action"] as? String,
              ["snapshot", "start", "pause", "ack", "confirm", "solo"].contains(action) else { return ["ok": false] }
        if seen.contains(id) { return ["ok": false, "reason": "duplicate"] }
        seen.insert(id); seenOrder.append(id)
        if seenOrder.count > 128 { seen.remove(seenOrder.removeFirst()) }
        if action == "snapshot" {
            var result = snapshot(at: now); result["ok"] = true; result["commandId"] = id; return result
        }
        if action == "solo" {
            guard message["session"] as? String == sessionID else { return ["ok": false] }
            return ["ok": true, "solo": true, "commandId": id]
        }
        if action == "ack" || action == "confirm" {
            _ = snapshot(at: now, issueLease: false)
            guard message["session"] as? String == sessionID,
                  syncInteger(message["revision"]) == revision,
                  message["state"] as? String == phase else { return ["ok": false] }
            return ["ok": true, "acknowledged": true, "confirmed": action == "confirm", "revision": revision, "commandId": id]
        }
        guard message["session"] as? String == sessionID,
              let expected = syncInteger(message["revision"]), expected == revision,
              let lease = message["lease"] as? String, lease == leaseID,
              let expiry = leaseExpiry, now <= expiry else { return ["ok": false, "reason": "stale"] }
        let seconds = syncInteger(message["seconds"]) ?? 0
        guard action != "start" || seconds == presetSeconds else { return ["ok": false, "reason": "preset-conflict"] }
        let accepted = apply(kind: action, seconds: seconds, at: now)
        var result = snapshot(at: now); result["ok"] = accepted; result["commandId"] = id
        return result
    }
}

struct TestSyncSnapshot {
    let session: String
    let revision: Int
    let state: String
    let remainingMilliseconds: Int
    let lease: String
    init?(_ data: [String: Any]) {
        guard data["ok"] as? Bool == true, syncInteger(data["version"]) == 1,
              let session = data["session"] as? String, UUID(uuidString: session) != nil,
              let revision = syncInteger(data["revision"]), (0...1_000_000).contains(revision),
              let state = data["state"] as? String, ["ready", "running", "paused", "finished"].contains(state),
              let remaining = syncInteger(data["remainingMs"]), (0...300_000).contains(remaining),
              let lease = data["lease"] as? String, UUID(uuidString: lease) != nil else { return nil }
        self.session = session; self.revision = revision; self.state = state
        remainingMilliseconds = remaining; self.lease = lease
    }
    func correlatedRemaining(roundTrip seconds: Double) -> Double? {
        guard seconds >= 0, seconds <= 0.5 else { return nil }
        let remaining = Double(remainingMilliseconds) / 1000 - (state == "running" ? seconds / 2 : 0)
        guard state != "running" || remaining > 0 else { return nil }
        return max(0, remaining)
    }
}

enum TestSyncReconciliation {
    static func compatible(localState: String, localSeconds: Double, remoteState: String,
                           remoteSeconds: Double, explicit: Bool) -> Bool {
        if explicit { return true }
        if remoteState == "ready" || remoteState == "finished" { return localState == "ready" }
        if localState == "ready" { return true }
        guard localState == remoteState || (localState == "running" && remoteState == "paused") else { return false }
        return abs(localSeconds - remoteSeconds) <= 1.5
    }
}
