import Foundation

@main
struct WindSampleFreshnessTests {
    static func main() {
        // CLHeading uses wall-clock seconds, CMDeviceMotion uses uptime seconds.
        let wallStart: TimeInterval = 1_700_000_000
        let uptimeStart: TimeInterval = 10_000
        precondition(WindSampleFreshness.isFresh(wallStart + 1, since: wallStart, now: wallStart + 3, maxAge: 2))
        precondition(!WindSampleFreshness.isFresh(wallStart - 1, since: wallStart, now: wallStart + 1, maxAge: 2)) // previous measurement
        precondition(!WindSampleFreshness.isFresh(wallStart, since: wallStart, now: wallStart + 2.01, maxAge: 2))
        precondition(!WindSampleFreshness.isFresh(wallStart + 2, since: wallStart, now: wallStart + 1, maxAge: 2))
        precondition(WindSampleFreshness.isFresh(uptimeStart + 1, since: uptimeStart, now: uptimeStart + 2, maxAge: 1))
        precondition(!WindSampleFreshness.isFresh(uptimeStart - 0.1, since: uptimeStart, now: uptimeStart + 0.2, maxAge: 1))
        precondition(!WindSampleFreshness.isFresh(uptimeStart + 3, since: uptimeStart, now: uptimeStart + 2, maxAge: 1))
        precondition(!WindSampleFreshness.isFresh(-1, since: 0, now: 1, maxAge: 2))
        precondition(!WindSampleFreshness.isFresh(.nan, since: 0, now: 1, maxAge: 2))
        print("Wind sample freshness: PASS")
    }
}
