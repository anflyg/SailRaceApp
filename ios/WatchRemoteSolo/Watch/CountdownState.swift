import Foundation

struct CountdownPresetStore {
    let defaults: UserDefaults
    private let key = "watchTestCountdownPreset"
    func load() -> Int {
        let value = defaults.integer(forKey: key)
        return (1...5).contains(value) ? value : 5
    }
    func save(_ minutes: Int) {
        guard (1...5).contains(minutes) else { return }
        defaults.set(minutes, forKey: key)
    }
}

// Time is supplied by the caller so sleep and interrupted callbacks are testable.
struct CountdownState {
    enum Phase { case ready, running, paused, finished }
    private(set) var phase: Phase = .ready
    private(set) var presetMinutes: Int
    private var deadline: ContinuousClock.Instant?
    private var pausedDuration: Duration = .zero
    private var lastUpdate: ContinuousClock.Instant?
    private var lastSecond = 0

    init(presetMinutes: Int = 5) {
        self.presetMinutes = (1...5).contains(presetMinutes) ? presetMinutes : 5
    }

    var presetSeconds: Int { presetMinutes * 60 }
    mutating func selectPreset(_ minutes: Int) -> Bool {
        guard phase == .ready, (1...5).contains(minutes), minutes != presetMinutes else { return false }
        presetMinutes = minutes
        return true
    }
    mutating func start(at now: ContinuousClock.Instant, seconds: Int? = nil) {
        phase = .running
        setDeadline(at: now, duration: .seconds(seconds ?? presetSeconds))
    }
    private mutating func setDeadline(at now: ContinuousClock.Instant, duration: Duration) {
        deadline = now.advanced(by: duration)
        lastUpdate = now
        lastSecond = max(0, Int(ceil(durationSeconds(duration))))
    }
    private func durationSeconds(_ duration: Duration) -> Double {
        let parts = duration.components
        return Double(parts.seconds) + Double(parts.attoseconds) / 1e18
    }
    func remaining(at now: ContinuousClock.Instant) -> Int {
        switch phase {
        case .ready: return presetSeconds
        case .finished: return 0
        case .paused: return max(0, Int(ceil(durationSeconds(pausedDuration))))
        case .running: return max(0, Int(ceil(durationSeconds(now.duration(to: deadline!)))))
        }
    }
    mutating func pause(at now: ContinuousClock.Instant) -> Bool {
        guard phase == .running, let deadline, now < deadline else { return false }
        pausedDuration = now.duration(to: deadline)
        self.deadline = nil
        lastUpdate = nil
        phase = .paused
        return true
    }
    mutating func resume(at now: ContinuousClock.Instant) -> Bool {
        guard phase == .paused, pausedDuration > .zero else { return false }
        phase = .running
        setDeadline(at: now, duration: pausedDuration)
        return true
    }
    mutating func cancel() {
        deadline = nil
        lastUpdate = nil
        pausedDuration = .zero
        phase = .ready
    }
    mutating func finishDisplay() {
        if phase == .finished { cancel() }
    }
    mutating func update(at now: ContinuousClock.Instant, allowCue: Bool) -> (remaining: Int, cue: Int?)? {
        guard phase == .running, let deadline else { return nil }
        let left = durationSeconds(now.duration(to: deadline))
        let seconds = max(0, Int(ceil(left)))
        let timely = lastUpdate.map { now >= $0 && now <= $0.advanced(by: .milliseconds(300)) } ?? false
        let cue = allowCue && timely && (0...5).contains(seconds) && lastSecond == seconds + 1 && left >= Double(seconds) - 0.25 ? seconds : nil
        lastUpdate = now
        lastSecond = seconds
        if seconds == 0 { self.deadline = nil; lastUpdate = nil; phase = .finished }
        return (seconds, cue)
    }
}
