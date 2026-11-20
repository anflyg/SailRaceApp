import Foundation

@main struct WorkoutRecoveryStateTest {
    static func main() {
        var state = WorkoutRecoveryState()
        precondition(state.isChecking && !state.canStart)
        state.recoveryFinished(foundSession: false, failed: false)
        precondition(state.canStart)

        state.beginCheck()
        precondition(state.isChecking)
        state.recoveryFinished(foundSession: false, failed: true)
        precondition(!state.isChecking && state.needsRecoveryHelp && !state.canStart)
        state.retryRecovery()
        precondition(state.isChecking && !state.canStart)

        state.recoveryFinished(foundSession: false, failed: false)
        precondition(state.canStart && !state.hasActiveWorkout)

        state.recoveryFinished(foundSession: true, failed: false)
        precondition(state.hasActiveWorkout && !state.canStart)
        state.workoutEnded()
        precondition(state.needsHealthReview && !state.canStart)
        state.confirmHealthReview()
        precondition(state.canStart)

        state.recoveryFinished(foundSession: true, failed: false)
        state.workoutEnded()
        precondition(state.needsHealthReview && !state.canStart && !state.hasActiveWorkout)
        print("PASS: recovery failure, retry, recovered end and discard review")
    }
}
