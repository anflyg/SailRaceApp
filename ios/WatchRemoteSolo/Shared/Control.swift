import Foundation

enum Phase: String { case ready, running, paused }
enum Action: String { case start, pause, resume, reset }

// Phone-only authority. A new query invalidates any commands from prior sessions.
struct Authority {
    private(set) var phase: Phase = .ready
    private(set) var generation = UUID().uuidString
    private var replies: [String: (Bool, Phase)] = [:]
    mutating func refresh() -> (String, Phase) {
        generation = UUID().uuidString
        replies.removeAll()
        return (generation, phase)
    }
    mutating func execute(id: String, generation: String, action: Action) -> (Bool, Phase) {
        guard generation == self.generation else { return (false, phase) }
        if let prior = replies[id] { return (prior.0, phase) }
        let next: Phase?
        switch (phase, action) {
        case (.ready, .start), (.paused, .resume): next = .running
        case (.running, .pause): next = .paused
        case (_, .reset): next = .ready
        default: next = nil
        }
        if let next { phase = next }
        let reply = (next != nil, phase)
        replies[id] = reply
        return reply
    }
}
