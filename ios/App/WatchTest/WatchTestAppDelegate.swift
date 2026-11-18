import UIKit
import Capacitor

@main
class WatchTestAppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        WatchFeasibilityReceiver.shared.start()
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = WatchTestBridgeViewController()
        window?.makeKeyAndVisible()
        return true
    }
}

final class WatchTestBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WatchFeasibilityPlugin())
    }
}
