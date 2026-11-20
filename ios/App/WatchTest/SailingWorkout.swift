#if WATCH_TEST_CANDIDATE
import SwiftUI
import HealthKit
import WatchKit

final class WatchTestWorkoutAppDelegate: NSObject, WKApplicationDelegate {
    private var recoveryHandler: (() -> Void)?
    private var recoveryPending = false

    func handleActiveWorkoutRecovery() {
        guard let recoveryHandler else { recoveryPending = true; return }
        DispatchQueue.main.async(execute: recoveryHandler)
    }

    func installRecoveryHandler(_ handler: @escaping () -> Void) {
        recoveryHandler = handler
        guard recoveryPending else { return }
        recoveryPending = false
        handler()
    }
}

// An explicit sailing fitness experiment, independent of the countdown.
final class SailingWorkout: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    @Published private(set) var status = "Checking for an active workout"
    @Published private(set) var active = false
    @Published private(set) var paused = false
    @Published private(set) var busy = false
    @Published private(set) var healthAvailable = false
    @Published private(set) var recovery = WorkoutRecoveryState()
    @Published private(set) var heartRate: Double?
    @Published private(set) var heartRateSampleDate: Date?
    @Published private(set) var startDate: Date?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var dataSource: HKLiveWorkoutDataSource?
    private var finishingSession = false
    private let heartType = HKQuantityType(.heartRate)

    func liveHeartRate(at date: Date) -> Int? {
        guard active, let heartRate, heartRate.isFinite, heartRate > 0, heartRate < 300,
              let heartRateSampleDate, date.timeIntervalSince(heartRateSampleDate) <= 30,
              date >= heartRateSampleDate else { return nil }
        return Int(heartRate.rounded())
    }

    override init() {
        super.init()
        healthAvailable = HKHealthStore.isHealthDataAvailable()
    }

    func checkForRecoverableWorkout() {
        guard !busy, !active else { return }
        guard healthAvailable else {
            recovery.recoveryFinished(foundSession: false, failed: false)
            status = "Health data unavailable"
            return
        }
        if recovery.needsRecoveryHelp { recovery.retryRecovery() }
        else { recovery.beginCheck() }
        guard recovery.isChecking else { return }
        busy = true
        status = "Checking for an active workout"
        recoverActiveWorkout()
    }

    private func recoverActiveWorkout() {
        store.recoverActiveWorkoutSession { [weak self] recoveredSession, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let recoveredSession {
                    self.attach(recoveredSession)
                    self.recovery.recoveryFinished(foundSession: true, failed: false)
                    self.active = recoveredSession.state != .ended
                    self.paused = recoveredSession.state == .paused
                    self.startDate = recoveredSession.startDate
                    self.busy = false
                    if recoveredSession.state == .ended {
                        self.finishEndedSession(recoveredSession, at: recoveredSession.endDate ?? Date())
                    } else {
                        self.status = self.paused ? "Workout paused; end or discard it here" : "Workout recovered"
                    }
                } else if error != nil {
                    self.recovery.recoveryFinished(foundSession: false, failed: true)
                    self.active = false
                    self.paused = false
                    self.busy = false
                    self.status = "Could not recover workout. End any active workout in Workout, then retry."
                } else {
                    self.recovery.recoveryFinished(foundSession: false, failed: false)
                    self.busy = false
                    self.status = "Not started"
                }
            }
        }
    }

    func retryRecovery() {
        guard recovery.needsRecoveryHelp else { return }
        checkForRecoverableWorkout()
    }

    func confirmHealthReview() {
        recovery.confirmHealthReview()
        guard recovery.canStart else { return }
        status = "Ready"
    }

    func start() {
        guard !busy, recovery.canStart, !active, healthAvailable else { return }
        busy = true
        status = "Requesting Health access"
        store.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [heartType]) { [weak self] success, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard success, error == nil, self.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else {
                    self.busy = false
                    self.status = "Workout access not granted"
                    return
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
        let source = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: session.workoutConfiguration)
        builder.dataSource = source
        dataSource = source
    }

    private func begin() {
        do {
            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .sailing
            configuration.locationType = .unknown
            let session = try HKWorkoutSession(healthStore: store, configuration: configuration)
            attach(session)
            let now = Date()
            startDate = now
            active = true
            status = "Starting workout"
            session.startActivity(with: now)
            builder?.beginCollection(withStart: now) { [weak self] success, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if success {
                        self.recovery.recoveryFinished(foundSession: true, failed: false)
                        self.busy = false
                        self.status = "Workout active"
                    } else {
                        self.busy = true
                        self.status = "Workout could not start; ending and discarding it"
                        self.session?.end()
                    }
                }
            }
        } catch {
            session = nil
            builder = nil
            dataSource = nil
            busy = false
            active = false
            recovery.recoveryFinished(foundSession: false, failed: false)
            status = "Workout could not start"
        }
    }

    func end() {
        guard active, !busy, let session else { return }
        busy = true
        status = "Ending and discarding workout"
        session.end()
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        DispatchQueue.main.async { [weak self] in
            guard let self, workoutSession === self.session else { return }
            switch toState {
            case .running:
                self.paused = false
                self.active = true
                if !self.busy { self.status = "Workout active" }
            case .paused:
                self.paused = true
                self.active = true
                self.busy = false
                self.status = "Workout paused; end or discard it here"
            case .ended:
                self.finishEndedSession(workoutSession, at: date)
            default:
                break
            }
        }
    }

    private func finishEndedSession(_ workoutSession: HKWorkoutSession, at date: Date) {
        guard !finishingSession else { return }
        finishingSession = true
        busy = true
        let workoutBuilder = workoutSession.associatedWorkoutBuilder()
        workoutBuilder.delegate = self
        workoutBuilder.endCollection(withEnd: date) { [weak self] success, error in
            workoutBuilder.discardWorkout()
            DispatchQueue.main.async {
                guard let self else { return }
                self.recovery.workoutEnded()
                self.active = false
                self.paused = false
                self.busy = false
                self.session = nil
                self.builder = nil
                self.dataSource = nil
                self.heartRate = nil
                self.heartRateSampleDate = nil
                self.startDate = nil
                self.finishingSession = false
                self.status = success && error == nil
                    ? "Workout ended; check Health to confirm it was discarded"
                    : "Workout ended with an error; check Health before starting again"
            }
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        guard workoutSession === session else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.status = "Workout interrupted; ending and discarding it"
            self.busy = true
            if workoutSession.state == .ended {
                self.finishEndedSession(workoutSession, at: workoutSession.endDate ?? Date())
            } else {
                workoutSession.end()
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard workoutBuilder === builder,
              collectedTypes.contains(heartType),
              let quantity = workoutBuilder.statistics(for: heartType)?.mostRecentQuantity() else { return }
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
                if workout.recovery.needsRecoveryHelp {
                    Text("If a workout is still active, end it in Apple's Workout app before retrying here.").font(.caption2)
                    Button("Retry recovery") { workout.retryRecovery() }.disabled(workout.busy)
                } else if workout.recovery.needsHealthReview {
                    Text("Check Health to confirm the ended workout was discarded before starting another.").font(.caption2)
                    Button("I checked Health") { workout.confirmHealthReview() }.disabled(workout.busy)
                } else if workout.active {
                    if let start = workout.startDate { Text(start, style: .timer).monospacedDigit() }
                    if workout.paused { Text("Workout paused") }
                    Text(workout.heartRate.map { "\(Int($0)) bpm" } ?? "Heart rate unavailable")
                    Button("End & discard") { workout.end() }.disabled(workout.busy)
                } else {
                    Text("Start only for a real sailing workout. Health access is requested for heart rate and workouts. The workout is discarded when ended; health samples may remain in Health. Uses battery.").font(.caption2)
                    Button("Allow & start") { workout.start() }.disabled(workout.busy || !workout.recovery.canStart || !workout.healthAvailable)
                }
            }
        }.focusable(true)
    }
}
#endif
