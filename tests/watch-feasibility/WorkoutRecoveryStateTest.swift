import Foundation

@main struct WorkoutRecoveryStateTest {
    static func main() {
        let suite = "watch-auto-workout-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let preference = AutomaticWorkoutPreference(defaults: defaults)
        precondition(!preference.enabled)
        preference.enable()
        precondition(AutomaticWorkoutPreference(defaults: defaults).enabled)
        preference.disable()
        precondition(!preference.enabled)

        var state = WorkoutRecoveryState()
        precondition(state.isChecking && !state.canStart)
        func decide(_ enabled: Bool, _ active: Bool = false, _ paused: Bool = false, _ busy: Bool = false, _ available: Bool = true) -> AutomaticWorkoutPolicy.Decision {
            AutomaticWorkoutPolicy.decide(enabled: enabled, active: active, paused: paused, busy: busy,
                                          healthAvailable: available, recovery: state)
        }
        precondition(decide(false) == .disabled)
        precondition(decide(true) == .wait)
        state.recoveryFinished(foundSession: false, failed: false)
        precondition(state.canStart)
        precondition(decide(true) == .start)
        precondition(decide(true, false, false, true) == .wait)
        precondition(decide(true, false, false, false, false) == .unavailable)

        state.beginCheck()
        precondition(state.isChecking)
        state.recoveryFinished(foundSession: false, failed: true)
        precondition(!state.isChecking && state.needsRecoveryHelp && !state.canStart)
        precondition(decide(true) == .unavailable)
        state.retryRecovery()
        precondition(state.isChecking && !state.canStart)

        state.recoveryFinished(foundSession: false, failed: false)
        precondition(state.canStart && !state.hasActiveWorkout)

        state.recoveryFinished(foundSession: true, failed: false)
        precondition(state.hasActiveWorkout && !state.canStart)
        precondition(decide(true, true) == .reuse)
        precondition(decide(true, true, true) == .unavailable)
        precondition(decide(true, true, false, true) == .wait)
        state.workoutEnded()
        precondition(state.needsHealthReview && !state.canStart)
        precondition(decide(true) == .unavailable)
        state.confirmHealthReview()
        precondition(state.canStart)

        state.recoveryFinished(foundSession: true, failed: false)
        state.workoutEnded()
        precondition(state.needsHealthReview && !state.canStart && !state.hasActiveWorkout)
        let base = ContinuousClock.now
        var countdown = CountdownState()
        var workoutStarts = 0
        var workoutActive = false
        AutomaticWorkoutPolicy.startCountdown({
            countdown.start(at: base, seconds: 60)
            return true
        }, initiateWorkout: {
            precondition(countdown.phase == .running && countdown.remaining(at: base) == 60)
            workoutStarts += 1
            workoutActive = true
        })
        AutomaticWorkoutPolicy.startCountdown({ false }, initiateWorkout: { workoutStarts += 1 })
        precondition(workoutStarts == 1)
        countdown.cancel()
        precondition(workoutActive && workoutStarts == 1)
        countdown.start(at: base, seconds: 60)
        _ = countdown.update(at: base.advanced(by: .seconds(61)), allowCue: false)
        precondition(countdown.phase == .finished && workoutActive && workoutStarts == 1)
        print("PASS: auto workout opt-in, countdown sequencing, reuse, gates, reset and completion")
        print("PASS: recovery failure, retry, recovered end and discard review")
    }
}
