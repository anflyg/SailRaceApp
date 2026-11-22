import Foundation
public protocol WCSessionDelegate {}
public enum WCSessionActivationState { case activated }
public final class WCSession {
    public static let `default` = WCSession()
    public static func isSupported() -> Bool { true }
    public var delegate: WCSessionDelegate?
    public var activationState: WCSessionActivationState = .activated
    public var isReachable = true
    public var context: [String: Any] = [:]
    public func activate() {}
    public func updateApplicationContext(_ value: [String: Any]) throws { context = value }
    public func sendMessage(_ value: [String: Any], replyHandler: (([String: Any]) -> Void)?, errorHandler: ((Error) -> Void)?) {}
}
