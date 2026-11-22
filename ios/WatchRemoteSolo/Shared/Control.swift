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

// Phone-only authority. A new query invalidates any commands from prior sessions.
struct Authority {
    private(set) var phase: Phase = .ready
    private(set) var generation = UUID().uuidString
    private var replies: [String: (generation: String, action: Action, accepted: Bool)] = [:]
    mutating func refresh() -> (String, Phase) {
        generation = UUID().uuidString
        return (generation, phase)
    }
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
        if let next { phase = next }
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
