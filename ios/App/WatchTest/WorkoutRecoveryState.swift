import Foundation

struct WorkoutRecoveryState: Equatable {
    enum Phase: Equatable {
        case checking
        case ready
        case active
        case recoveryFailed
        case healthReviewRequired
    }

    private(set) var phase: Phase = .checking
    var isChecking: Bool { phase == .checking }
    var canStart: Bool { phase == .ready }
    var hasActiveWorkout: Bool { phase == .active }
    var needsRecoveryHelp: Bool { phase == .recoveryFailed }
    var needsHealthReview: Bool { phase == .healthReviewRequired }

    mutating func recoveryFinished(foundSession: Bool, failed: Bool) {
        if foundSession { phase = .active }
        else if failed { phase = .recoveryFailed }
        else { phase = .ready }
    }

    mutating func retryRecovery() {
        guard phase == .recoveryFailed else { return }
        phase = .checking
    }

    mutating func beginCheck() {
        guard phase == .ready else { return }
        phase = .checking
    }

    mutating func workoutEnded() {
        // HKWorkoutBuilder.discardWorkout() has no completion result to confirm persistence.
        phase = .healthReviewRequired
    }

    mutating func confirmHealthReview() {
        guard phase == .healthReviewRequired else { return }
        phase = .ready
    }
}
