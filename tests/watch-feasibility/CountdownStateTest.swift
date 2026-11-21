import Foundation

@main struct CountdownStateTest {
    static func main() {
        let suite = "watch-countdown-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = CountdownPresetStore(defaults: defaults)
        precondition(store.load() == 5 && defaults.persistentDomain(forName: suite) == nil)
        store.save(4)
        precondition(CountdownPresetStore(defaults: defaults).load() == 4)
        store.save(6)
        precondition(store.load() == 4)
        let base = ContinuousClock.now
        func at(_ seconds: Double) -> ContinuousClock.Instant { base.advanced(by: .milliseconds(Int64(seconds * 1000))) }
        var state = CountdownState()
        state.start(at: base, seconds: 60)
        precondition(state.update(at: at(10), allowCue: true)?.remaining == 50)
        // Simulate a suspended process: no timer callbacks for 20 seconds.
        let resumed = state.update(at: at(30), allowCue: false)!
        precondition(resumed.remaining == 30 && resumed.cue == nil)
        // Suspension over the end of the countdown must not play a start cue.
        let completed = state.update(at: at(65), allowCue: false)!
        precondition(completed.remaining == 0 && completed.cue == nil)
        precondition(state.update(at: at(66), allowCue: true) == nil)
        state.start(at: base, seconds: 60)
        _ = state.update(at: at(54), allowCue: true)
        for seconds in stride(from: 5, through: 0, by: -1) {
            let t = Double(60 - seconds) + 0.05
            _ = state.update(at: at(t - 0.15), allowCue: true)
            precondition(state.update(at: at(t), allowCue: true)?.cue == seconds)
            precondition(state.update(at: at(t + 0.1), allowCue: true)?.cue == nil)
        }
        state.start(at: base, seconds: 60)
        _ = state.update(at: at(54), allowCue: true)
        precondition(state.update(at: at(57.1), allowCue: true)?.cue == nil)
        _ = state.update(at: at(57.9), allowCue: true)
        precondition(state.update(at: at(58.05), allowCue: true)?.cue == 2)
        state.cancel()
        precondition(state.update(at: at(60), allowCue: true) == nil)
        state.start(at: base, seconds: 60)
        _ = state.update(at: at(58), allowCue: false)
        precondition(state.update(at: at(60.3), allowCue: true)?.cue == nil)
        state.start(at: base, seconds: 60)
        _ = state.update(at: at(59.9), allowCue: false)
        precondition(state.update(at: at(60.05), allowCue: true)?.cue == 0)
        state.start(at: base, seconds: 60)
        _ = state.update(at: at(59), allowCue: false)
        precondition(state.update(at: at(60.05), allowCue: true)?.cue == nil)
        var controls = CountdownState()
        precondition(controls.presetMinutes == 5 && controls.remaining(at: base) == 300)
        precondition(!controls.selectPreset(0) && !controls.selectPreset(6))
        precondition(controls.selectPreset(3) && controls.presetMinutes == 3)
        controls.start(at: base)
        precondition(!controls.selectPreset(5))
        precondition(controls.pause(at: at(10.25)))
        precondition(controls.remaining(at: at(100)) == 170 && !controls.skip(at: at(100)))
        precondition(controls.resume(at: at(100)))
        precondition(controls.remaining(at: at(101)) == 169)
        precondition(controls.skip(at: at(106)))
        precondition(controls.remaining(at: at(106)) == 120 && controls.presetMinutes == 3)
        precondition(controls.skip(at: at(106)))
        precondition(controls.remaining(at: at(106)) == 60 && !controls.skip(at: at(106)))
        controls.cancel()
        precondition(controls.phase == .ready && controls.remaining(at: at(106)) == 180)
        controls.start(at: base, seconds: 60)
        _ = controls.update(at: at(59.9), allowCue: false)
        precondition(controls.pause(at: at(59.95)))
        precondition(controls.resume(at: at(100)))
        precondition(controls.update(at: at(101), allowCue: true)?.cue == nil)
        precondition(controls.phase == .finished)
        controls.finishDisplay()
        precondition(controls.phase == .ready && controls.presetMinutes == 3)
        for (seconds, expected) in [(193, 180), (180, 120), (83, 60), (60, 0), (59, 0)] {
            var skip = CountdownState()
            skip.start(at: base, seconds: seconds)
            let didSkip = skip.skip(at: base)
            precondition(didSkip == (expected > 0))
            if didSkip {
                precondition(skip.remaining(at: base) == expected)
                precondition(skip.update(at: at(0.1), allowCue: true)?.cue == nil)
            }
        }
        print("PASS: preset bounds, pause/resume, strict minute skips, reset, completion and stale cue suppression")
        print("PASS: simulated suspension, resume, cues, skipped boundaries, cancellation and late zero")
    }
}
