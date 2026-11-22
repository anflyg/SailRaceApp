import Foundation

@main struct Tests {
    static func main() {
        let id = UUID().uuidString
        let payload: [String: Any] = ["kind": "command", "id": id, "generation": "g", "action": "start"]
        precondition(Command.parse(payload) != nil)
        var modifiedPayload = payload
        modifiedPayload["unexpected"] = "changed"
        precondition(Command.parse(modifiedPayload) == nil)
        var phone = Authority()
        let (generation, state) = phone.refresh()
        precondition(state == .ready)
        let first = phone.execute(id: "a", generation: generation, action: .start)
        precondition(first.0 && first.1 == .running)
        let duplicate = phone.execute(id: "a", generation: generation, action: .start)
        precondition(duplicate.0 && duplicate.1 == .running && !duplicate.2)
        let collision = phone.execute(id: "a", generation: generation, action: .reset)
        precondition(!collision.0 && phone.phase == .running, "reused ID with another action must be rejected")
        precondition(!phone.execute(id: "b", generation: generation, action: .start).0)
        precondition(phone.execute(id: "c", generation: generation, action: .pause).1 == .paused)
        precondition(phone.execute(id: "d", generation: generation, action: .resume).1 == .running)
        let (sameGeneration, _) = phone.refresh()
        precondition(sameGeneration == generation, "queries must not rotate generation")
        phone.invalidateSession()
        let (newGeneration, _) = phone.refresh()
        precondition(!phone.execute(id: "a", generation: newGeneration, action: .reset).0)
        precondition(phone.phase == .running)
        precondition(!phone.execute(id: "e", generation: generation, action: .reset).0)
        precondition(phone.execute(id: "f", generation: newGeneration, action: .reset).1 == .ready)
        precondition(phone.execute(id: "g", generation: newGeneration, action: .start).0)
        let repeatedReset = phone.execute(id: "f", generation: newGeneration, action: .reset)
        precondition(repeatedReset.0 && !repeatedReset.2 && phone.phase == .running)
        let firstSnapshot = phone.snapshot
        var revisions = ControlRevisionGate()
        precondition(revisions.establish(firstSnapshot))
        precondition(!revisions.accept(firstSnapshot), "duplicate or stale revision rejected")
        _ = phone.execute(id: "h", generation: newGeneration, action: .pause)
        let newer = phone.snapshot
        precondition(newer.revision > firstSnapshot.revision && revisions.accept(newer))
        precondition(!revisions.accept(firstSnapshot), "out-of-order revision rejected")
        let other = Authority().snapshot
        precondition(!revisions.accept(other), "unsolicited old or unknown epoch rejected")
        precondition(revisions.establish(other), "current query can establish a new epoch")
        precondition(ControlSnapshot.parse(newer.message)?.revision == newer.revision)
        precondition(Set(newer.message.keys) == Set(["kind", "epoch", "generation", "revision", "phase"]))
        // A timeout or disconnect invalidates the request before a refresh.
        var gate = RemoteRequestGate()
        let timedOut = gate.begin()
        gate.invalidate()
        let reconnect = gate.begin()
        var confirmed = Phase.ready
        if gate.complete(reconnect, mode: "remote") { confirmed = .paused }
        if gate.complete(timedOut, mode: "remote") { confirmed = .running }
        precondition(confirmed == .paused, "late acknowledgement overwrote newer state")
        let pending = gate.begin()
        gate.invalidate() // explicit switch to SOLO
        precondition(!gate.complete(pending, mode: "solo"))
        precondition(!gate.accepts(gate.begin(), mode: "solo"))
        print("Control tests passed")
    }
}
