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
    func queryReply(_ index: Int, generation: String, phase: Phase) {
        sent[index].reply(["generation": generation, "phase": phase.rawValue])
    }
    func commandReply(_ index: Int, accepted: Bool, phase: Phase) {
        sent[index].reply(["id": sent[index].payload["id"]!, "ok": accepted, "phase": phase.rawValue])
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

        watch.refresh()
        let (g1, initial) = phone.refresh()
        fake.queryReply(0, generation: g1, phase: initial)
        precondition(watch.phase == .ready && !watch.pending)
        var gesture = RemotePress()
        gesture.begin(at: 0)
        precondition(fake.sent.count == 1, "press must not send before release")
        if let action = gesture.release(at: 0.6, primary: watch.primaryAction) { watch.command(action) }
        if let action = gesture.release(at: 2.1, primary: watch.primaryAction) { watch.command(action) }
        precondition(fake.sent.count == 2, "one press must send exactly one command")
        let start = fake.sent[1]
        let startID = start.payload["id"] as! String
        precondition(watch.pending && watch.phase == .ready && watch.primaryLabel == "START" && !watch.available)
        watch.command(.start)
        precondition(fake.sent.count == 2, "pending command must not dispatch twice")
        precondition(phone.execute(id: startID, generation: g1, action: .start).0)
        // Fire the actual command's scheduled timeout, then resolve its refresh.
        fake.timers[1]()
        precondition(fake.sent.count == 3 && fake.sent[2].payload["kind"] as? String == "query")
        let (g2, afterTimeout) = phone.refresh()
        fake.queryReply(2, generation: g2, phase: afterTimeout)
        precondition(watch.phase == .running && watch.primaryLabel == "PAUSA" && !watch.pending)
        fake.commandReply(1, accepted: true, phase: .ready)
        precondition(watch.phase == .running, "late ACK must not overwrite the refreshed state")
        fake.timers[1]() // Duplicate timeout delivery must not issue another query.
        precondition(fake.sent.count == 3)
        precondition(fake.sent.filter { $0.payload["action"] as? String == "start" }.count == 1)
        precondition(!phone.execute(id: UUID().uuidString, generation: g1, action: .reset).0)
        precondition(phone.phase == .running)

        watch.command(.pause)
        let pendingPause = fake.sent.count - 1
        fake.reachable = false
        watch.reachabilityChanged()
        precondition(!watch.pending && watch.status == "Ej tillgänglig" && watch.mode == "remote")
        fake.reachable = true
        watch.reachabilityChanged()
        let reconnect = fake.sent.count - 1
        precondition(fake.sent[reconnect].payload["kind"] as? String == "query")
        let (g3, state) = phone.refresh()
        fake.queryReply(reconnect, generation: g3, phase: state)
        let oldPause = fake.sent[pendingPause].payload
        precondition(!phone.execute(id: oldPause["id"] as! String, generation: oldPause["generation"] as! String, action: .pause).0)
        precondition(phone.phase == .running, "old in-flight command must not execute after refresh")
        fake.commandReply(pendingPause, accepted: true, phase: .paused)
        precondition(watch.phase == .running && watch.mode == "remote")
        precondition(fake.sent.filter { $0.payload["action"] as? String == "start" }.count == 1)

        // A periodic refresh must not invalidate a press or its generation.
        for phase in [Phase.running, .paused] {
            if phase == .paused {
                watch.command(.pause)
                let index = fake.sent.count - 1
                let payload = fake.sent[index].payload
                let reply = phone.execute(id: payload["id"] as! String, generation: payload["generation"] as! String, action: .pause)
                precondition(reply.0 && reply.1 == .paused)
                fake.commandReply(index, accepted: reply.0, phase: reply.1)
            }
            precondition(watch.phase == phase)
            var hold = RemotePress()
            hold.begin(at: 0)
            watch.setPressActive(true)
            let count = fake.sent.count
            for _ in 0..<50 { watch.tick() }
            precondition(fake.sent.count == count && watch.available, "poll must not interrupt a hold")
            let action = hold.release(at: 2, primary: watch.primaryAction)!
            precondition(action == .reset && fake.sent.count == count)
            watch.setPressActive(false)
            watch.command(action)
            let payload = fake.sent.last!.payload
            precondition(fake.sent.count == count + 1 && payload["action"] as? String == "reset")
            let reply = phone.execute(id: payload["id"] as! String, generation: payload["generation"] as! String, action: action)
            precondition(reply.0 && reply.1 == .ready)
            precondition(watch.phase == phase, "wait for phone acknowledgment")
            fake.commandReply(fake.sent.count - 1, accepted: reply.0, phase: reply.1)
            precondition(watch.phase == .ready)
            if phase == .running {
                watch.command(.start)
                let index = fake.sent.count - 1
                let payload = fake.sent[index].payload
                let reply = phone.execute(id: payload["id"] as! String, generation: payload["generation"] as! String, action: .start)
                precondition(reply.0)
                fake.commandReply(index, accepted: reply.0, phase: reply.1)
            }
        }

        watch.soloAction(.start)
        precondition(watch.mode == "remote" && watch.solo.phase == .ready, "SOLO action must remain disabled")
        print("REMOTE transport tests passed")
    }
}
