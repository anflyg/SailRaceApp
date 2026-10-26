import AuthenticationServices
import Capacitor
import CryptoKit
import Security

/// Fixed-purpose Apple/Keychain bridge. Never logs arguments, tokens or errors.
@objc(TackWiseAuthPlugin)
public class TackWiseAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "TackWiseAuthPlugin"
    public let jsName = "TackWiseAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "credentialState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise)
    ]
    private var pending: CAPPluginCall?
    private var nonce: String?
    private var requestState: String?
    private var controller: ASAuthorizationController?
    private var anchor: ASPresentationAnchor?
    private var revocationObserver: NSObjectProtocol?
    private var service: String { (Bundle.main.bundleIdentifier ?? "TackWise") + ".auth.v1" }
    private let installMarker = "TackWiseAuth.install.v1"
    private let logoutMarker = "TackWiseAuth.logoutPending.v1"

    public override func load() {
        revocationObserver = NotificationCenter.default.addObserver(forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            // Fail closed in JS even if protected Keychain is temporarily unavailable.
            UserDefaults.standard.set(true, forKey: self.logoutMarker)
            try? self.saveEnvelope(self.signedOut())
            self.notifyListeners("revoked", data: [:])
        }
    }
    deinit { if let observer = revocationObserver { NotificationCenter.default.removeObserver(observer) } }

    private func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw Failure.storage }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
    private enum Failure: Error { case storage }

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("busy", "busy"); return }
            guard let window = self.bridge?.viewController?.view.window else { call.reject("unavailable", "unavailable"); return }
            do {
                let raw = try self.random()
                let state = try self.random()
                let request = ASAuthorizationAppleIDProvider().createRequest()
                request.requestedScopes = [] // No name or email collection.
                request.nonce = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
                request.state = state
                self.nonce = raw
                self.requestState = state
                self.pending = call
                self.anchor = window
                let controller = ASAuthorizationController(authorizationRequests: [request])
                self.controller = controller
                controller.delegate = self
                controller.presentationContextProvider = self
                controller.performRequests()
            } catch { call.reject("unavailable", "unavailable") }
        }
    }
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return anchor ?? ASPresentationAnchor()
    }
    private func finish() { pending = nil; nonce = nil; requestState = nil; controller = nil; anchor = nil }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        defer { finish() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == requestState, let raw = nonce,
              let data = credential.identityToken, data.count <= 16384,
              let token = String(data: data, encoding: .utf8), !credential.user.isEmpty else {
            call.reject("invalid_credentials", "invalid_credentials"); return
        }
        call.resolve(["identityToken": token, "rawNonce": raw, "appleUser": credential.user])
    }
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        pending?.reject(cancelled ? "cancelled" : "unavailable", cancelled ? "cancelled" : "unavailable")
        finish()
    }
    @objc func credentialState(_ call: CAPPluginCall) {
        guard let user = call.getString("appleUser"), !user.isEmpty, user.count <= 512 else { call.reject("invalid_credentials", "invalid_credentials"); return }
        ASAuthorizationAppleIDProvider().getCredentialState(forUserID: user) { state, error in
            guard error == nil else { call.reject("unavailable", "unavailable"); return }
            call.resolve(["state": state == .authorized ? "authorized" : state == .revoked || state == .notFound || state == .transferred ? "revoked" : "unknown"])
        }
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "session", kSecAttrSynchronizable as String: false]
    }
    private func signedOut() -> [String: Any] { ["revision": UUID().uuidString, "value": NSNull()] }
    private func saveEnvelope(_ envelope: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: envelope)
        let attrs: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            attrs.forEach { item[$0.key] = $0.value }
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw Failure.storage }
        } else if status != errSecSuccess { throw Failure.storage }
    }
    private func envelope() throws -> [String: Any] {
        if !UserDefaults.standard.bool(forKey: installMarker) {
            // Keychain can survive uninstall. Never restore an orphaned old installation.
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure.storage }
            try saveEnvelope(signedOut())
            UserDefaults.standard.set(true, forKey: installMarker) // Non-secret installation marker only.
        }
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { let empty = signedOut(); try saveEnvelope(empty); return empty }
        guard status == errSecSuccess, let data = result as? Data,
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              value["revision"] is String else { throw Failure.storage }
        if UserDefaults.standard.bool(forKey: logoutMarker), value["value"] is String {
            let empty = signedOut()
            try saveEnvelope(empty)
            return empty
        }
        return value
    }
    @objc func readSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async { do { call.resolve(try self.envelope()) } catch { call.reject("storage_unavailable", "storage_unavailable") } }
    }
    @objc func writeSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                let old = try self.envelope()
                guard let revision = call.getString("revision"), revision == old["revision"] as? String,
                      let value = call.getString("value"), value.utf8.count <= 16384 else { call.reject("stale_session", "stale_session"); return }
                try self.saveEnvelope(["revision": revision, "value": value])
                UserDefaults.standard.set(false, forKey: self.logoutMarker)
                call.resolve()
            } catch { call.reject("storage_unavailable", "storage_unavailable") }
        }
    }
    @objc func clearSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Non-secret fail-closed latch: a locked Keychain must not restore old tokens.
            UserDefaults.standard.set(true, forKey: self.logoutMarker)
            do {
                _ = try self.envelope()
                let empty = self.signedOut()
                try self.saveEnvelope(empty) // Atomic logout tombstone invalidates old writes.
                call.resolve(empty)
            } catch { call.reject("storage_unavailable", "storage_unavailable") }
        }
    }
}
