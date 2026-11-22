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

        watch.command(.pause)
        let beforeSolo = fake.sent.count - 1
        watch.select("solo")
        watch.soloAction(.start)
        let soloPhase = watch.solo.phase
        let soloRemaining = watch.remaining
        let count = fake.sent.count
        watch.command(.start)
        watch.refresh()
        watch.reachabilityChanged()
        fake.commandReply(beforeSolo, accepted: true, phase: .paused)
        fake.timers.last?() // timeout after entering SOLO must not refresh
        precondition(fake.sent.count == count, "SOLO must not send messages")
        precondition(watch.mode == "solo" && watch.solo.phase == soloPhase && watch.remaining == soloRemaining)
        precondition(watch.phase == .running, "late REMOTE ACK changed state in SOLO")
        watch.soloAction(.pause); watch.soloAction(.resume); watch.soloAction(.reset)
        precondition(fake.sent.count == count && watch.solo.phase == .ready)

        watch.select("remote")
        watch.refresh()
        let pendingQuery = fake.sent.count - 1
        watch.select("solo")
        fake.queryReply(pendingQuery, generation: "late", phase: .ready)
        precondition(watch.mode == "solo" && watch.phase == .running)
        watch.select("remote")
        watch.refresh()
        let freshQuery = fake.sent.count - 1
        fake.queryReply(freshQuery, generation: "fresh", phase: .paused)
        fake.queryReply(pendingQuery, generation: "late", phase: .ready)
        precondition(watch.mode == "remote" && watch.phase == .paused, "old query overwrote a newer confirmed state")
        print("REMOTE transport tests passed")
    }
}
