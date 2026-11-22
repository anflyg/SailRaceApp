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
        var phone = Authority()

        watch.refresh()
        let (g1, initial) = phone.refresh()
        fake.queryReply(0, generation: g1, phase: initial)
        precondition(watch.phase == .ready && !watch.pending)
        watch.command(.start)
        let start = fake.sent[1]
        let startID = start.payload["id"] as! String
        precondition(watch.pending && watch.phase == .ready)
        precondition(phone.execute(id: startID, generation: g1, action: .start).0)
        // Fire the actual command's scheduled timeout, then resolve its refresh.
        fake.timers[1]()
        precondition(fake.sent.count == 3 && fake.sent[2].payload["kind"] as? String == "query")
        let (g2, afterTimeout) = phone.refresh()
        fake.queryReply(2, generation: g2, phase: afterTimeout)
        precondition(watch.phase == .running && !watch.pending)
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

        watch.soloAction(.start)
        precondition(watch.mode == "remote" && watch.solo.phase == .ready, "SOLO action must remain disabled")
        print("REMOTE transport tests passed")
    }
}
