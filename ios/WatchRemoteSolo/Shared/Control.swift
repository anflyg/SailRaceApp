import Foundation

enum Phase: String { case ready, running, paused }
enum Action: String { case start, pause, resume, reset }

struct Command {
    let id: String
    let generation: String
    let action: Action

    static func parse(_ message: [String: Any]) -> Command? {
        guard Set(message.keys) == Set(["kind", "id", "generation", "action"]),
              message["kind"] as? String == "command",
              let id = message["id"] as? String, UUID(uuidString: id) != nil,
              let generation = message["generation"] as? String,
              let raw = message["action"] as? String, let action = Action(rawValue: raw) else { return nil }
        return Command(id: id, generation: generation, action: action)
    }
}

// Revisions are scoped to one authority lifetime. A receiver must establish a
// new epoch through a fresh query before accepting unsolicited snapshots.
struct ControlSnapshot {
    let epoch: String
    let generation: String
    let revision: Int
    let phase: Phase
    var message: [String: Any] { ["kind": "state", "epoch": epoch, "generation": generation, "revision": revision, "phase": phase.rawValue] }
    static func parse(_ message: [String: Any]) -> ControlSnapshot? {
        guard message["kind"] as? String == "state",
              let epoch = message["epoch"] as? String, UUID(uuidString: epoch) != nil,
              let generation = message["generation"] as? String, UUID(uuidString: generation) != nil,
              let revision = message["revision"] as? Int, revision >= 0,
              let raw = message["phase"] as? String, let phase = Phase(rawValue: raw) else { return nil }
        return ControlSnapshot(epoch: epoch, generation: generation, revision: revision, phase: phase)
    }
}

struct ControlRevisionGate {
    private(set) var snapshot: ControlSnapshot?
    // Only a current, identified query may establish a different authority epoch.
    mutating func establish(_ next: ControlSnapshot) -> Bool {
        if let current = snapshot, current.epoch == next.epoch { return accept(next) }
        snapshot = next; return true
    }
    mutating func accept(_ next: ControlSnapshot) -> Bool {
        guard let current = snapshot, current.epoch == next.epoch, next.revision > current.revision else { return false }
        snapshot = next; return true
    }
}

// Phone-only authority; queries do not invalidate commands.
struct Authority {
    private(set) var phase: Phase = .ready
    private(set) var generation = UUID().uuidString
    private let epoch = UUID().uuidString
    private(set) var revision = 0
    var snapshot: ControlSnapshot { ControlSnapshot(epoch: epoch, generation: generation, revision: revision, phase: phase) }
    mutating func invalidateSession() { generation = UUID().uuidString; revision += 1 }
    private var replies: [String: (generation: String, action: Action, accepted: Bool)] = [:]
    func refresh() -> (String, Phase) { (generation, phase) }
    mutating func execute(id: String, generation: String, action: Action) -> (Bool, Phase, Bool) {
        guard generation == self.generation else { return (false, phase, false) }
        if let prior = replies[id] {
            guard prior.generation == generation, prior.action == action else { return (false, phase, false) }
            return (prior.accepted, phase, false)
        }
        let next: Phase?
        switch (phase, action) {
        case (.ready, .start), (.paused, .resume): next = .running
        case (.running, .pause): next = .paused
        case (_, .reset): next = .ready
        default: next = nil
        }
        if let next, next != phase { phase = next; revision += 1 }
        let accepted = next != nil
        replies[id] = (generation, action, accepted)
        return (accepted, phase, true)
    }
}

// Tracks the single in-flight request. Invalidating a request prevents late
// callbacks from changing confirmed state after a timeout or mode switch.
struct RemoteRequestGate {
    private(set) var token = UUID()
    private(set) var pending = false
    mutating func begin() -> UUID { token = UUID(); pending = true; return token }
    mutating func invalidate() { token = UUID(); pending = false }
    func accepts(_ candidate: UUID, mode: String) -> Bool {
        mode == "remote" && pending && token == candidate
    }
    mutating func complete(_ candidate: UUID, mode: String) -> Bool {
        guard accepts(candidate, mode: mode) else { return false }
        pending = false
        return true
    }
}
