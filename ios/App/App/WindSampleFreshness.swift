import Foundation

enum WindSampleFreshness {
    // Timestamps and start/now must all be in the same clock domain.
    static func isFresh(_ timestamp: TimeInterval, since start: TimeInterval, now: TimeInterval, maxAge: TimeInterval) -> Bool {
        timestamp.isFinite && start.isFinite && now.isFinite && maxAge.isFinite &&
            timestamp >= 0 && start >= 0 && maxAge >= 0 &&
            timestamp >= start && timestamp <= now && now - timestamp <= maxAge
    }
}
