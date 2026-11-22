import Foundation
import Darwin
import CoreFoundation

func syncInteger(_ value: Any?) -> Int? {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue.isFinite, number.doubleValue >= Double(Int32.min), number.doubleValue <= Double(Int32.max),
          number.doubleValue == Double(number.intValue) else { return nil }
    return number.intValue
}

private func syncClockValue(_ value: Any?) -> Double? {
    guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue.isFinite, number.doubleValue >= 0, number.doubleValue < 1e10 else { return nil }
    return number.doubleValue
}

enum TestSyncClock {
    static var now: Double {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(mach_continuous_time()) * Double(info.numer) / Double(info.denom) / 1e9
    }
}

// Isolated feasibility protocol. Device clock samples require explicit correlation.
struct TestSyncAuthority {
    let sessionID = UUID().uuidString
    private(set) var timelineID = UUID().uuidString
    private(set) var lastCommandID = UUID().uuidString
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
                "remainingMs": remaining(at: now), "lease": leaseID, "presetSeconds": presetSeconds,
                "timeline": timelineID, "lastCommandId": lastCommandID, "clockReceive": now, "clockSample": now]
    }
    private func remaining(at now: Double) -> Int {
        if phase == "paused" { return pausedMilliseconds }
        guard phase == "running", let deadline else { return 0 }
        return max(0, min(300_000, Int((deadline - now) * 1000)))
    }
    mutating func apply(kind: String, seconds: Int, at now: Double, commandID: String = UUID().uuidString) -> Bool {
        _ = snapshot(at: now, issueLease: false)
        if kind == "start", (phase == "ready" || phase == "finished"), (60...300).contains(seconds), seconds % 60 == 0 {
            phase = "running"; deadline = now + Double(seconds); revision += 1
            timelineID = UUID().uuidString; lastCommandID = commandID; return true
        }
        if kind == "pause", phase == "running" {
            pausedMilliseconds = remaining(at: now)
            guard pausedMilliseconds > 0 else { return false }
            phase = "paused"; deadline = nil; revision += 1; lastCommandID = commandID; return true
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
        if seen.contains(id) { return ["ok": false, "reason": "duplicate", "commandId": id] }
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
              let expiry = leaseExpiry, now <= expiry else { return ["ok": false, "reason": "stale", "commandId": id] }
        let seconds = syncInteger(message["seconds"]) ?? 0
        guard action != "start" || seconds == presetSeconds else { return ["ok": false, "reason": "preset-conflict", "commandId": id] }
        let accepted = apply(kind: action, seconds: seconds, at: now, commandID: id)
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
    let timeline: String
    let lastCommandID: String
    let clockReceive: Double
    let clockSample: Double
    init?(_ data: [String: Any]) {
        guard data["ok"] as? Bool == true, syncInteger(data["version"]) == 1,
              let session = data["session"] as? String, UUID(uuidString: session) != nil,
              let revision = syncInteger(data["revision"]), (0...1_000_000).contains(revision),
              let state = data["state"] as? String, ["ready", "running", "paused", "finished"].contains(state),
              let remaining = syncInteger(data["remainingMs"]), (0...300_000).contains(remaining),
              let lease = data["lease"] as? String, UUID(uuidString: lease) != nil,
              let timeline = data["timeline"] as? String, UUID(uuidString: timeline) != nil,
              let lastCommandID = data["lastCommandId"] as? String, UUID(uuidString: lastCommandID) != nil else { return nil }
        self.session = session; self.revision = revision; self.state = state
        remainingMilliseconds = remaining; self.lease = lease
        self.timeline = timeline; self.lastCommandID = lastCommandID
        guard let receive = syncClockValue(data["clockReceive"]), let sample = syncClockValue(data["clockSample"]), sample >= receive else { return nil }
        clockReceive = receive; clockSample = sample
    }

}

// NTP-style interval bounds: phone minus Watch clock offset. Clock epochs are
// never equated. Repeated asymmetric exchanges can narrow a slow cold sample.
struct TestSyncCorrelation {
    private var session: String?
    private var lower: Double?
    private var upper: Double?
    private var lastObservation: Double?
    private var samples: [(lower: Double, upper: Double, received: Double)] = []
    private(set) var uncertainty: Double = .infinity

    mutating func observe(_ snapshot: TestSyncSnapshot, sent: Double, received: Double) -> Bool {
        guard sent.isFinite, received.isFinite, received >= sent, received - sent <= 5,
              snapshot.clockSample - snapshot.clockReceive <= received - sent + 0.002 else { return false }
        let low = snapshot.clockSample - received - 0.001
        let high = snapshot.clockReceive - sent + 0.001
        guard low <= high else { return false }
        if session != snapshot.session { session = snapshot.session; samples.removeAll() }
        samples.removeAll { received - $0.received > 30 || received < $0.received }
        samples.append((low, high, received))
        if samples.count > 16 { samples.removeFirst() }
        // Prototype drift allowance: 1000 ppm, plus 1 ms timestamp precision.
        let intersectionLow = samples.map { $0.lower - (received - $0.received) * 0.001 }.max()!
        let intersectionHigh = samples.map { $0.upper + (received - $0.received) * 0.001 }.min()!
        if intersectionLow <= intersectionHigh {
            lower = intersectionLow; upper = intersectionHigh
        } else {
            samples = [(low, high, received)]; lower = low; upper = high
        }
        lastObservation = received
        uncertainty = (upper! - lower!) / 2
        return true
    }

    func remaining(_ snapshot: TestSyncSnapshot, at localNow: Double) -> Double? {
        guard snapshot.session == session, let low = lower, let high = upper,
              let observed = lastObservation, localNow >= observed, localNow - observed <= 10 else { return nil }
        if snapshot.state != "running" { return Double(snapshot.remainingMilliseconds) / 1000 }
        let drift = (localNow - observed) * 0.001
        guard uncertainty + drift <= 0.25 else { return nil }
        let phoneNow = localNow + (low + high) / 2
        let remaining = Double(snapshot.remainingMilliseconds) / 1000 - (phoneNow - snapshot.clockSample)
        guard remaining > 0, remaining <= 300 else { return nil }
        return remaining
    }
}

enum TestSyncReconciliation {
    static func commandIsFresh(expiry: Double, now: Double) -> Bool {
        expiry.isFinite && now.isFinite && now <= expiry
    }
    static func mayAutomaticallyJoin(localReady: Bool, knownTimeline: String?, remoteTimeline: String, independent: Bool) -> Bool {
        !independent && (localReady || knownTimeline == remoteTimeline)
    }
    static func compatible(localState: String, localSeconds: Double, remoteState: String,
                           remoteSeconds: Double, explicit: Bool) -> Bool {
        if explicit { return true }
        if remoteState == "ready" || remoteState == "finished" { return localState == "ready" }
        if localState == "ready" { return true }
        guard localState == remoteState || (localState == "running" && remoteState == "paused") else { return false }
        return abs(localSeconds - remoteSeconds) <= 1.5
    }
}
