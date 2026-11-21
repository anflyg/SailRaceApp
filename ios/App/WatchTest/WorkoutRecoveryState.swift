import Foundation

struct AutomaticWorkoutPreference {
    let defaults: UserDefaults
    private let key = "watchTestAutoSailingWorkout"
    var enabled: Bool { defaults.bool(forKey: key) }
    func enable() { defaults.set(true, forKey: key) }
    func disable() { defaults.removeObject(forKey: key) }
}

struct AutomaticWorkoutPolicy {
    enum Decision { case disabled, wait, reuse, start, unavailable }

    static func startCountdown(_ start: () -> Bool, initiateWorkout: () -> Void) {
        guard start() else { return }
        initiateWorkout()
    }

    static func decide(enabled: Bool, active: Bool, paused: Bool, busy: Bool,
                       healthAvailable: Bool, recovery: WorkoutRecoveryState) -> Decision {
        guard enabled else { return .disabled }
        if busy || recovery.isChecking { return .wait }
        if active { return paused ? .unavailable : .reuse }
        return healthAvailable && recovery.canStart ? .start : .unavailable
    }
}

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
