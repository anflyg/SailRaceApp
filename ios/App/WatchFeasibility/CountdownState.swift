import Foundation

// The caller supplies a continuous-clock instant. Kept independent of the
// UI so suspended intervals and cue suppression can be tested deterministically.
struct CountdownState {
    private var deadline: ContinuousClock.Instant?
    private var lastUpdate: ContinuousClock.Instant?
    private var lastSecond = 61

    mutating func start(at now: ContinuousClock.Instant) {
        deadline = now.advanced(by: .seconds(60))
        lastUpdate = now
        lastSecond = 61
    }

    mutating func cancel() { deadline = nil; lastUpdate = nil }

    mutating func update(at now: ContinuousClock.Instant, allowCue: Bool) -> (remaining: Int, cue: Int?)? {
        guard let deadline else { return nil }
        let duration = now.duration(to: deadline).components
        let left = Double(duration.seconds) + Double(duration.attoseconds) / 1e18
        let seconds = max(0, Int(ceil(left)))
        let timelyCallback = lastUpdate.map { now >= $0 && now <= $0.advanced(by: .milliseconds(300)) } ?? false
        let cue = allowCue && timelyCallback && (0...5).contains(seconds) && lastSecond == seconds + 1 && left >= Double(seconds) - 0.25 ? seconds : nil
        lastUpdate = now
        lastSecond = seconds
        if seconds == 0 { self.deadline = nil; lastUpdate = nil }
        return (seconds, cue)
    }
}
