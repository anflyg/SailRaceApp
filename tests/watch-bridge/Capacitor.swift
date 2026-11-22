import Foundation
public let CAPPluginReturnPromise = "promise"
public class CAPPluginMethod { public init(name: String, returnType: String) {} }
open class CAPPlugin: NSObject {
    public static var onNotify: ((String, [String: Any]) -> Void)?
    open func load() {}
    public func notifyListeners(_ name: String, data: [String: Any]) { CAPPlugin.onNotify?(name, data) }
}
public protocol CAPBridgedPlugin {}
public class CAPPluginCall: NSObject {
    let values: [String: Any]
    public var resolved = false
    public var rejected = false
    public init(_ values: [String: Any] = [:]) { self.values = values }
    public func getString(_ key: String) -> String? { values[key] as? String }
    public func resolve() { resolved = true }
    public func reject(_ message: String) { rejected = true }
}
