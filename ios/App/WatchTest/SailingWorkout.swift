#if WATCH_TEST_CANDIDATE
import SwiftUI
import HealthKit

// An explicit sailing fitness experiment, independent of the countdown.
final class SailingWorkout: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    @Published private(set) var status = "Not started"
    @Published private(set) var active = false
    @Published private(set) var busy = true
    @Published private(set) var heartRate: Double?
    @Published private(set) var heartRateSampleDate: Date?
    @Published private(set) var startDate: Date?
    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private let heartType = HKQuantityType(.heartRate)

    func liveHeartRate(at date: Date) -> Int? {
        guard active, let heartRate, heartRate.isFinite, heartRate > 0, heartRate < 300,
              let heartRateSampleDate, date.timeIntervalSince(heartRateSampleDate) <= 30,
              date >= heartRateSampleDate else { return nil }
        return Int(heartRate.rounded())
    }

    override init() {
        super.init()
        guard HKHealthStore.isHealthDataAvailable() else { busy = false; status = "Health data unavailable"; return }
        store.recoverActiveWorkoutSession { [weak self] session, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let session {
                    self.attach(session)
                    self.active = true
                    self.status = "Workout recovered"
                    self.startDate = session.startDate
                } else if error != nil {
                    self.status = "Recovery unavailable; check Watch workout"
                    return
                }
                self.busy = false
            }
        }
    }

    func start() {
        guard !busy, !active, HKHealthStore.isHealthDataAvailable() else { return }
        busy = true
        status = "Requesting Health access"
        store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [heartType]) { [weak self] success, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard success, error == nil, self.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else {
                    self.busy = false; self.status = "Workout access not granted"; return
                }
                self.begin()
            }
        }
    }

    private func attach(_ session: HKWorkoutSession) {
        self.session = session
        session.delegate = self
        let builder = session.associatedWorkoutBuilder()
        self.builder = builder
        builder.delegate = self
    }

    private func begin() {
        do {
            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .sailing
            configuration.locationType = .unknown
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            attach(session)
            let source = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
            builder?.dataSource = source
            let now = Date()
            startDate = now
            active = true
            status = "Starting workout"
            session.startActivity(with: now)
            builder?.beginCollection(withStart: now) { [weak self] success, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.busy = false
                    if success { self.status = "Workout active" }
                    else { self.status = "Workout could not start"; self.session?.end() }
                }
            }
        } catch {
            session = nil; builder = nil; busy = false; active = false
            status = "Workout could not start"
        }
    }

    func end() {
        guard active, !busy, let session else { return }
        busy = true
        status = "Ending workout"
        session.end()
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        let workoutBuilder = workoutSession.associatedWorkoutBuilder()
        workoutBuilder.endCollection(withEnd: date) { [weak self] _, _ in
            workoutBuilder.discardWorkout()
            DispatchQueue.main.async {
                guard let self else { return }
                self.active = false; self.busy = false; self.session = nil; self.builder = nil
                self.heartRate = nil; self.heartRateSampleDate = nil; self.startDate = nil; self.status = "Workout discarded"
            }
        }
    }
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.status = "Workout error; end workout"
            self?.busy = false
            if workoutSession.state != .ended { workoutSession.end() }
        }
    }
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(heartType), let quantity = workoutBuilder.statistics(for: heartType)?.mostRecentQuantity() else { return }
        let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        DispatchQueue.main.async { [weak self] in
            self?.heartRate = bpm
            self?.heartRateSampleDate = Date()
        }
    }
}

struct SailingWorkoutView: View {
    @ObservedObject var workout: SailingWorkout
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Sailing workout").font(.headline)
                Text(workout.status).font(.caption)
                if workout.active {
                    if let start = workout.startDate { Text(start, style: .timer).monospacedDigit() }
                    Text(workout.heartRate.map { "\(Int($0)) bpm" } ?? "Heart rate unavailable")
                    Button("End & discard") { workout.end() }.disabled(workout.busy)
                } else {
                    Text("Start only for a real sailing workout. Health access is requested for heart rate and workouts. The workout is discarded when ended; health samples may remain in Health. Uses battery.").font(.caption2)
                    Button("Allow & start") { workout.start() }.disabled(workout.busy)
                }
            }
        }.focusable(true)
    }
}
#endif
