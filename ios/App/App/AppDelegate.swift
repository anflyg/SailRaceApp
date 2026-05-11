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
    }
}

@objc(WindHeadingPlugin)
public class WindHeadingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WindHeadingPlugin"
    public let jsName = "WindHeading"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getBackVectorHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeviceAttitude", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBackVectorHeading", returnType: CAPPluginReturnPromise)
    ]

    private let motionManager = CMMotionManager()
    private var activeReferenceFrame: CMAttitudeReferenceFrame?

    @objc func getBackVectorHeading(_ call: CAPPluginCall) {
        guard motionManager.isDeviceMotionAvailable else {
            call.unavailable("Core Motion är inte tillgängligt.")
            return
        }

        guard let selectedReferenceFrame = preferredReferenceFrame() else {
            call.unavailable("Nordreferens är inte tillgänglig.")
            return
        }

        startDeviceMotionUpdatesIfNeeded(using: selectedReferenceFrame.frame)

        guard let motion = motionManager.deviceMotion else {
            call.resolve([
                "valid": false,
                "headingDegrees": NSNull(),
                "referenceFrame": selectedReferenceFrame.name
            ])
            return
        }

        guard let headingDegrees = backVectorHeadingDegrees(from: motion.attitude.rotationMatrix) else {
            call.resolve([
                "valid": false,
                "headingDegrees": NSNull(),
                "referenceFrame": selectedReferenceFrame.name
            ])
            return
        }

        call.resolve([
            "valid": true,
            "headingDegrees": headingDegrees,
            "referenceFrame": selectedReferenceFrame.name
        ])
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
        motionManager.stopDeviceMotionUpdates()
        activeReferenceFrame = nil
        call.resolve()
    }

    private func preferredReferenceFrame() -> (frame: CMAttitudeReferenceFrame, name: String)? {
        let availableReferenceFrames = CMMotionManager.availableAttitudeReferenceFrames()

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
        motionManager.deviceMotionUpdateInterval = 1.0 / 30.0
        motionManager.startDeviceMotionUpdates(using: referenceFrame)
        activeReferenceFrame = referenceFrame
    }

    private func backVectorHeadingDegrees(from rotationMatrix: CMRotationMatrix) -> Double? {
        let northComponent = -rotationMatrix.m13
        let westComponent = -rotationMatrix.m23
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
}
