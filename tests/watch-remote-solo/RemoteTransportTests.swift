import Foundation

final class FakeTransport {
    struct Sent {
        let payload: [String: Any]
        let reply: ([String: Any]) -> Void
        let error: (Error) -> Void
    }
    var reachable = true
    var sent: [Sent] = []
    var timers: [() -> Void] = []
    func io() -> RemoteIO {
        RemoteIO(isReachable: { self.reachable }, send: { message, reply, error in
            self.sent.append(Sent(payload: message, reply: reply, error: error))
        }, schedule: { self.timers.append($0) }, deliver: { $0() })
    }
    func queryReply(_ index: Int, snapshot: ControlSnapshot) { sent[index].reply(snapshot.message) }
    func commandReply(_ index: Int, accepted: Bool, snapshot: ControlSnapshot) {
        var reply = snapshot.message
        reply["id"] = sent[index].payload["id"]!; reply["ok"] = accepted
        sent[index].reply(reply)
    }
}

@main struct Tests {
    static func main() {
        let suite = "watch-remote-tests-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let fake = FakeTransport()
        let watch = WatchModel(io: fake.io(), defaults: defaults, startServices: false)
        precondition(watch.mode == "remote" && defaults.string(forKey: "watchMode") == "remote")
        defaults.set("solo", forKey: "watchMode")
        let migrated = WatchModel(io: fake.io(), defaults: defaults, startServices: false)
        precondition(migrated.mode == "remote" && defaults.string(forKey: "watchMode") == "remote")
        let originalPreset = migrated.solo.presetMinutes
        migrated.selectPreset(originalPreset == 5 ? 1 : 5)
        migrated.soloAction(.start)
        precondition(migrated.solo.phase == .ready && migrated.solo.presetMinutes == originalPreset && fake.sent.isEmpty, "SOLO must be inaccessible")
        for (duration, expected) in [(0.0, Optional<Action>.some(.start)), (0.1, .start), (0.399, .start), (0.4, .start), (1.2, .start), (1.201, .start), (1.999, .start), (2.0, .reset), (3.0, .reset)] {
            var press = RemotePress()
            press.begin(at: 0)
            precondition(press.release(at: duration, primary: .start) == expected)
            precondition(press.release(at: duration, primary: .start) == nil, "release must dispatch at most once")
        }
        for action in [Action.start, .pause, .resume] {
            var tap = RemotePress()
            tap.begin(at: 0)
            precondition(tap.release(at: 0.1, primary: action) == action)
            tap.begin(at: 0)
            precondition(tap.release(at: 2.0, primary: action) == .reset)
        }
        var press = RemotePress()
        press.begin(at: 0)
        precondition(!press.update(at: 1.999) && press.update(at: 2.0) && !press.update(at: 2.1))
        press.cancel()
        precondition(press.release(at: 2.2, primary: .start) == nil, "canceled press must not dispatch")
        press.begin(at: 0)
        press.updateLocation(isInside: true)
        press.updateLocation(isInside: false)
        press.updateLocation(isInside: true)
        precondition(press.release(at: 0.1, primary: .start) == nil, "drag outside and back must remain canceled")
        press.begin(at: 0)
        press.updateLocation(isInside: false)
        precondition(!press.update(at: 2.1) && press.release(at: 2.1, primary: .pause) == nil, "outside long press must not cue or dispatch")
        // Running uses the same threshold clock and release classifier as ready.
        var runningHold = RemotePress()
        runningHold.begin(at: 100)
        precondition(!runningHold.update(at: 101.999))
        precondition(runningHold.update(at: 102.0))
        precondition(!runningHold.update(at: 102.1))
        precondition(runningHold.release(at: 102.1, primary: .pause) == .reset)
        runningHold.begin(at: 200)
        precondition(runningHold.update(at: 202.0))
        runningHold.cancel() // Simulates an actual cancellation after threshold.
        precondition(runningHold.release(at: 202.1, primary: .pause) == nil)
        var phone = Authority()
        watch.refresh() // activation
        precondition(fake.sent.count == 1 && watch.status == "Ansluter")
        fake.queryReply(0, snapshot: phone.snapshot)
        precondition(watch.phase == .ready && watch.available && watch.status == "Ansluten")
        let baselineTimers = fake.timers.count
        precondition(fake.timers.count == baselineTimers, "no periodic poll scheduled")

        // Foreground synchronization remains available and same-state replies do not change phase.
        watch.foreground()
        precondition(fake.sent.count == 2 && watch.available && watch.status == "Ansluten")
        let old = phone.snapshot
        _ = phone.execute(id: UUID().uuidString, generation: phone.generation, action: .start)
        let running = phone.snapshot
        watch.receiveState(running.message)
        precondition(watch.phase == .running && watch.available)
        fake.queryReply(1, snapshot: old)
        precondition(watch.phase == .running && watch.status == "Ansluten", "stale query cannot overwrite event")
        watch.receiveState(old.message)
        watch.receiveState(running.message)
        precondition(watch.phase == .running, "old and duplicate events ignored")

        // A pending command cannot be completed by a push; newer events beat an older ACK.
        watch.command(.pause)
        let commandIndex = fake.sent.count - 1
        let payload = fake.sent[commandIndex].payload
        precondition(watch.pending && !watch.available && watch.phase == .running)
        let accepted = phone.execute(id: payload["id"] as! String, generation: payload["generation"] as! String, action: .pause)
        let paused = phone.snapshot
        precondition(accepted.0)
        watch.receiveState(paused.message)
        precondition(watch.pending && watch.phase == .running && watch.status == "Väntar")
        watch.foreground()
        let queryDuringCommand = fake.sent.count - 1
        fake.queryReply(queryDuringCommand, snapshot: paused)
        precondition(watch.pending && watch.phase == .running, "query must not acknowledge command")
        _ = phone.execute(id: UUID().uuidString, generation: phone.generation, action: .resume)
        let newer = phone.snapshot
        watch.receiveState(newer.message)
        fake.commandReply(commandIndex, accepted: true, snapshot: paused)
        precondition(!watch.pending && watch.available && watch.phase == .running, "newer event wins after ACK")

        // Timeout triggers only a query, never a replay; late ACK is ignored.
        watch.command(.pause)
        let uncertainIndex = fake.sent.count - 1
        let uncertainPayload = fake.sent[uncertainIndex].payload
        precondition(phone.execute(id: uncertainPayload["id"] as! String, generation: uncertainPayload["generation"] as! String, action: .pause).0)
        let afterPause = phone.snapshot
        fake.timers.last!()
        let recovery = fake.sent.count - 1
        precondition(fake.sent[recovery].payload["kind"] as? String == "query")
        fake.queryReply(recovery, snapshot: afterPause)
        precondition(watch.phase == .paused && watch.available)
        fake.commandReply(uncertainIndex, accepted: true, snapshot: newer)
        precondition(watch.phase == .paused, "late ACK must not override recovery")
        precondition(fake.sent.filter { $0.payload["action"] as? String == "pause" }.count == 2)

        // Reconnect queries after missed transitions; stale messages cannot roll back.
        fake.reachable = false; watch.reachabilityChanged()
        precondition(!watch.available && watch.status == "Ej tillgänglig")
        phone.invalidateSession()
        _ = phone.execute(id: UUID().uuidString, generation: phone.generation, action: .reset)
        fake.reachable = true; watch.reachabilityChanged()
        let reconnect = fake.sent.count - 1
        fake.queryReply(reconnect, snapshot: phone.snapshot)
        precondition(watch.phase == .ready && watch.available)
        watch.receiveState(afterPause.message)
        precondition(watch.phase == .ready)

        // Unsolicited new epochs are reconciled through an identified query.
        let restarted = Authority()
        watch.foreground()
        let outdatedQuery = fake.sent.count - 1
        watch.receiveState(restarted.snapshot.message)
        fake.queryReply(outdatedQuery, snapshot: phone.snapshot)
        precondition(!watch.available, "query superseded by a new epoch must be ignored")
        precondition(!watch.available && fake.sent.last?.payload["kind"] as? String == "query")
        fake.queryReply(fake.sent.count - 1, snapshot: restarted.snapshot)
        precondition(watch.phase == .ready && watch.available)
        let sentBeforeOldEpoch = fake.sent.count
        watch.receiveState(phone.snapshot.message)
        precondition(watch.available && fake.sent.count == sentBeforeOldEpoch, "retired epoch must not disrupt interaction")
        watch.soloAction(.start)
        precondition(watch.solo.phase == .ready)
        print("REMOTE event and transport tests passed")
    }
}
