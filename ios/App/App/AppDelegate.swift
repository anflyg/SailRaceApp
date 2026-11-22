import UIKit
import Capacitor
import CoreMotion

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

@objc(AppBridgeViewController)
class AppBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WindHeadingPlugin())
        bridge?.registerPluginInstance(TackWiseAuthPlugin())
        bridge?.registerPluginInstance(WatchCountdownPlugin())
        bridge?.registerPluginInstance(TackWiseAppInfoPlugin())
    }
}

@objc(TackWiseAppInfoPlugin)
public class TackWiseAppInfoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TackWiseAppInfoPlugin"
    public let jsName = "TackWiseAppInfo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise)
    ]

    @objc func getInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary ?? [:]
        call.resolve([
            "version": (info["CFBundleShortVersionString"] as? String).map { $0 as Any } ?? NSNull(),
            "build": (info["CFBundleVersion"] as? String).map { $0 as Any } ?? NSNull()
        ])
    }
}

@objc(WindHeadingPlugin)
public class WindHeadingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WindHeadingPlugin"
    public let jsName = "WindHeading"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "beginBackVectorHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBackVectorHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceAttitude", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTacticalHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackVectorHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDeviceAttitude", returnType: CAPPluginReturnPromise)
    ]

    private let motionManager = CMMotionManager()
    private var activeReferenceFrame: CMAttitudeReferenceFrame?
    private var windMeasurementStartUptime: TimeInterval?
    private let maxMotionAgeSeconds: TimeInterval = 1

    private struct HeadingDiagnostics {
        let backVectorHeadingDegrees: Double?
        let backVectorHeadingRowDegrees: Double?
        let frontVectorHeadingDegrees: Double?
        let topEdgeHeadingDegrees: Double?
        let rightEdgeHeadingDegrees: Double?
    }

    @objc func beginBackVectorHeading(_ call: CAPPluginCall) {
        windMeasurementStartUptime = ProcessInfo.processInfo.systemUptime
        call.resolve()
    }

    @objc func getBackVectorHeading(_ call: CAPPluginCall) {
        guard motionManager.isDeviceMotionAvailable else {
            call.unavailable("Core Motion är inte tillgängligt.")
            return
        }

        guard let selectedReferenceFrame = preferredReferenceFrame() else {
            call.unavailable("Nordreferens är inte tillgänglig.")
            return
        }

        guard windMeasurementStartUptime != nil else {
            call.reject("Wind measurement has not been started.")
            return
        }
        startDeviceMotionUpdatesIfNeeded(using: selectedReferenceFrame.frame)

        guard let measurementStartUptime = windMeasurementStartUptime,
              let motion = motionManager.deviceMotion,
              WindSampleFreshness.isFresh(motion.timestamp, since: measurementStartUptime,
                  now: ProcessInfo.processInfo.systemUptime, maxAge: maxMotionAgeSeconds) else {
            call.resolve([
                "valid": false,
                "headingDegrees": NSNull(),
                "referenceFrame": selectedReferenceFrame.name,
                "accuracyDegrees": NSNull()
            ])
            return
        }

        let rotationMatrix = motion.attitude.rotationMatrix
        let headingDiagnostics = headingDiagnostics(from: rotationMatrix)
        let nativeDebug = nativeDebugPayload(
            from: headingDiagnostics,
            rotationMatrix: rotationMatrix
        )

        let selectedHeadingDegrees = headingDiagnostics.backVectorHeadingRowDegrees
        let selectedHeadingSource = "back-vector-row"

        guard let headingDegrees = selectedHeadingDegrees else {
            call.resolve([
                "valid": false,
                "headingDegrees": NSNull(),
                "referenceFrame": selectedReferenceFrame.name,
                "accuracyDegrees": NSNull(),
                "selectedHeadingSource": selectedHeadingSource,
                "nativeDebug": nativeDebug
            ])
            return
        }

        call.resolve([
            "valid": true,
            "headingDegrees": headingDegrees,
            "motionTimestamp": motion.timestamp,
            "referenceFrame": selectedReferenceFrame.name,
            "accuracyDegrees": NSNull(),
            "selectedHeadingSource": selectedHeadingSource,
            "nativeDebug": nativeDebug
        ])
    }

    // Read the existing stream only: never start or change it during a wind capture.
    @objc func getTacticalHeading(_ call: CAPPluginCall) {
        let now = ProcessInfo.processInfo.systemUptime
        guard motionManager.isDeviceMotionActive, activeReferenceFrame == .xTrueNorthZVertical,
              let motion = motionManager.deviceMotion,
              WindSampleFreshness.isFresh(motion.timestamp, since: 0, now: now, maxAge: maxMotionAgeSeconds),
              let heading = backVectorHeadingDegrees(from: motion.attitude.rotationMatrix), heading.isFinite else {
            call.resolve(["valid": false])
            return
        }
        call.resolve(["valid": true, "headingDegrees": heading,
                      "motionTimestamp": motion.timestamp, "ageMs": (now - motion.timestamp) * 1000])
    }

    @objc func getDeviceAttitude(_ call: CAPPluginCall) {
        guard motionManager.isDeviceMotionAvailable else {
            call.unavailable("Core Motion är inte tillgängligt.")
            return
        }

        let selectedReferenceFrame = preferredMotionReferenceFrame()
        startDeviceMotionUpdatesIfNeeded(using: selectedReferenceFrame.frame)

        guard let motion = motionManager.deviceMotion else {
            call.resolve([
                "valid": false,
                "motionAvailable": false,
                "headingAvailable": false,
                "rollDegrees": NSNull(),
                "pitchDegrees": NSNull(),
                "referenceFrame": selectedReferenceFrame.name
            ])
            return
        }

        let headingAvailable = selectedReferenceFrame.hasHeading &&
            backVectorHeadingDegrees(from: motion.attitude.rotationMatrix) != nil

        let boatAttitude = boatAttitudeDegrees(from: motion.gravity)

        call.resolve([
            "valid": true,
            "motionAvailable": true,
            "headingAvailable": headingAvailable,
            "rollDegrees": boatAttitude.rollDegrees,
            "pitchDegrees": boatAttitude.pitchDegrees,
            "referenceFrame": selectedReferenceFrame.name,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }

    @objc func stopBackVectorHeading(_ call: CAPPluginCall) {
        windMeasurementStartUptime = nil
        call.resolve()
    }

    @objc func stopDeviceAttitude(_ call: CAPPluginCall) {
        motionManager.stopDeviceMotionUpdates()
        activeReferenceFrame = nil
        windMeasurementStartUptime = nil
        call.resolve()
    }

    private func preferredReferenceFrame() -> (frame: CMAttitudeReferenceFrame, name: String)? {
        let availableReferenceFrames = CMMotionManager.availableAttitudeReferenceFrames()

        // Prefer true north so GPS bearings, course geometry and wind heading
        // share the same reference. Magnetic north is a fallback and is not
        // declination-corrected by this plugin.
        if availableReferenceFrames.contains(.xTrueNorthZVertical) {
            return (.xTrueNorthZVertical, "true-north")
        }

        if availableReferenceFrames.contains(.xMagneticNorthZVertical) {
            return (.xMagneticNorthZVertical, "magnetic-north")
        }

        return nil
    }

    private func preferredMotionReferenceFrame() -> (
        frame: CMAttitudeReferenceFrame,
        name: String,
        hasHeading: Bool
    ) {
        if let headingReferenceFrame = preferredReferenceFrame() {
            return (
                headingReferenceFrame.frame,
                headingReferenceFrame.name,
                true
            )
        }

        let availableReferenceFrames = CMMotionManager.availableAttitudeReferenceFrames()

        if availableReferenceFrames.contains(.xArbitraryCorrectedZVertical) {
            return (.xArbitraryCorrectedZVertical, "arbitrary-corrected", false)
        }

        return (.xArbitraryZVertical, "arbitrary", false)
    }

    private func startDeviceMotionUpdatesIfNeeded(using referenceFrame: CMAttitudeReferenceFrame) {
        if motionManager.isDeviceMotionActive && activeReferenceFrame == referenceFrame {
            return
        }

        motionManager.stopDeviceMotionUpdates()
        if windMeasurementStartUptime != nil {
            // A restarted stream must not return an old frame's cached motion value.
            windMeasurementStartUptime = ProcessInfo.processInfo.systemUptime
        }
        motionManager.deviceMotionUpdateInterval = 1.0 / 30.0
        motionManager.startDeviceMotionUpdates(using: referenceFrame)
        activeReferenceFrame = referenceFrame
    }

    private func backVectorHeadingDegrees(from rotationMatrix: CMRotationMatrix) -> Double? {
        let diagnostics = headingDiagnostics(from: rotationMatrix)
        return diagnostics.backVectorHeadingRowDegrees
    }

    private func headingDiagnostics(from rotationMatrix: CMRotationMatrix) -> HeadingDiagnostics {
        // Device mount for wind heading:
        // - phone is upright on the mast
        // - phone -Z/back side points toward the bow
        // - phone screen/front points toward the stern
        //
        // The diagnostic column headings below are not the selected wind direction.
        // Under the reference-to-device DCM convention, the inverse is its
        // transpose, so device -Z projects to world (-m31, -m32, -m33).
        // X is north and Y west; negate west to obtain clockwise bearing.
        // Physical-device verification of the Core Motion convention is pending.
        let backVectorHeadingDegrees = headingDegreesFromComponents(
            northComponent: -rotationMatrix.m13,
            westComponent: -rotationMatrix.m23
        )
        let frontVectorHeadingDegrees = headingDegreesFromComponents(
            northComponent: rotationMatrix.m13,
            westComponent: rotationMatrix.m23
        )
        let topEdgeHeadingDegrees = headingDegreesFromComponents(
            northComponent: rotationMatrix.m12,
            westComponent: rotationMatrix.m22
        )
        let rightEdgeHeadingDegrees = headingDegreesFromComponents(
            northComponent: rotationMatrix.m11,
            westComponent: rotationMatrix.m21
        )

        let backVectorHeadingRowDegrees = WindHeadingMath.backHeading(
            m31: rotationMatrix.m31, m32: rotationMatrix.m32
        )

        return HeadingDiagnostics(
            backVectorHeadingDegrees: backVectorHeadingDegrees,
            backVectorHeadingRowDegrees: backVectorHeadingRowDegrees,
            frontVectorHeadingDegrees: frontVectorHeadingDegrees,
            topEdgeHeadingDegrees: topEdgeHeadingDegrees,
            rightEdgeHeadingDegrees: rightEdgeHeadingDegrees
        )
    }

    private func headingDegreesFromComponents(
        northComponent: Double,
        westComponent: Double
    ) -> Double? {
        let horizontalMagnitude = sqrt(
            northComponent * northComponent + westComponent * westComponent
        )

        guard horizontalMagnitude > 0.05 else {
            return nil
        }

        // In XTrueNorthZVertical/XMagneticNorthZVertical the X axis is north and
        // Z is vertical. The horizontal Y axis is west, so invert it for a
        // clockwise heading from north.
        let radians = atan2(-westComponent, northComponent)
        let degrees = radians * 180 / Double.pi
        return fmod(degrees + 360, 360)
    }

    private func nativeDebugPayload(
        from headingDiagnostics: HeadingDiagnostics,
        rotationMatrix: CMRotationMatrix
    ) -> [String: Any] {
        return [
            "headings": [
                "backVectorHeadingDegrees": optionalNumberOrNull(headingDiagnostics.backVectorHeadingDegrees),
                "backVectorHeadingRowDegrees": optionalNumberOrNull(headingDiagnostics.backVectorHeadingRowDegrees),
                "frontVectorHeadingDegrees": optionalNumberOrNull(headingDiagnostics.frontVectorHeadingDegrees),
                "topEdgeHeadingDegrees": optionalNumberOrNull(headingDiagnostics.topEdgeHeadingDegrees),
                "rightEdgeHeadingDegrees": optionalNumberOrNull(headingDiagnostics.rightEdgeHeadingDegrees)
            ],
            "clTrueHeadingDegrees": NSNull(),
            "clMagneticHeadingDegrees": NSNull(),
            "matrix": [
                "m11": rotationMatrix.m11,
                "m12": rotationMatrix.m12,
                "m13": rotationMatrix.m13,
                "m21": rotationMatrix.m21,
                "m22": rotationMatrix.m22,
                "m23": rotationMatrix.m23,
                "m31": rotationMatrix.m31,
                "m32": rotationMatrix.m32,
                "m33": rotationMatrix.m33
            ]
        ]
    }

    private func boatAttitudeDegrees(from gravity: CMAcceleration) -> (
        rollDegrees: Double,
        pitchDegrees: Double
    ) {
        // Device mount:
        // - device +X/right edge points to starboard
        // - device -Z/back side points to bow
        // - CMDeviceMotion.gravity is expressed in device coordinates and points down
        //
        // R/rullning is positive when starboard rises.
        // S/stampning is positive when the bow rises.
        let starboardUpComponent = clampedUnitValue(-gravity.x)
        let bowUpComponent = clampedUnitValue(gravity.z)

        return (
            rollDegrees: radiansToDegrees(asin(starboardUpComponent)),
            pitchDegrees: radiansToDegrees(asin(bowUpComponent))
        )
    }

    private func clampedUnitValue(_ value: Double) -> Double {
        return min(1, max(-1, value))
    }

    private func radiansToDegrees(_ radians: Double) -> Double {
        return radians * 180 / Double.pi
    }

    private func optionalNumberOrNull(_ value: Double?) -> Any {
        if let value = value {
            return value
        }

        return NSNull()
    }
}
