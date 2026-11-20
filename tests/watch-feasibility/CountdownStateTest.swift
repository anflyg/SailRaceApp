import Foundation

@main struct CountdownStateTest {
    static func main() {
        let base = ContinuousClock.now
        func at(_ seconds: Double) -> ContinuousClock.Instant { base.advanced(by: .milliseconds(Int64(seconds * 1000))) }
        var state = CountdownState()
        state.start(at: base)
        precondition(state.update(at: at(10), allowCue: true)?.remaining == 50)
        // Simulate a suspended process: no timer callbacks for 20 seconds.
        let resumed = state.update(at: at(30), allowCue: false)!
        precondition(resumed.remaining == 30 && resumed.cue == nil)
        // Suspension over the end of the countdown must not play a start cue.
        let completed = state.update(at: at(65), allowCue: false)!
        precondition(completed.remaining == 0 && completed.cue == nil)
        precondition(state.update(at: at(66), allowCue: true) == nil)
        state.start(at: base)
        _ = state.update(at: at(54), allowCue: true)
        for seconds in stride(from: 5, through: 0, by: -1) {
            let t = Double(60 - seconds) + 0.05
            _ = state.update(at: at(t - 0.15), allowCue: true)
            precondition(state.update(at: at(t), allowCue: true)?.cue == seconds)
            precondition(state.update(at: at(t + 0.1), allowCue: true)?.cue == nil)
        }
        state.start(at: base)
        _ = state.update(at: at(54), allowCue: true)
        precondition(state.update(at: at(57.1), allowCue: true)?.cue == nil)
        _ = state.update(at: at(57.9), allowCue: true)
        precondition(state.update(at: at(58.05), allowCue: true)?.cue == 2)
        state.cancel()
        precondition(state.update(at: at(60), allowCue: true) == nil)
        state.start(at: base)
        _ = state.update(at: at(58), allowCue: false)
        precondition(state.update(at: at(60.3), allowCue: true)?.cue == nil)
        state.start(at: base)
        _ = state.update(at: at(59.9), allowCue: false)
        precondition(state.update(at: at(60.05), allowCue: true)?.cue == 0)
        state.start(at: base)
        _ = state.update(at: at(59), allowCue: false)
        precondition(state.update(at: at(60.05), allowCue: true)?.cue == nil)
        print("PASS: simulated suspension, resume, cues, skipped boundaries, cancellation and late zero")
    }
}
