# Authentication

## Decision

**Sign in with Apple is the only planned end-user authentication method for TackWise.**

Traditional username/password accounts are not to be implemented unless this architecture decision is explicitly revisited.

## Identity model

Apple establishes the user's identity. Supabase Auth manages the application session and maps the authenticated user to an opaque Supabase user UUID.

The Supabase UUID, not email address or name, is the canonical internal identity.

Apple Hide My Email must be supported without special dependence on the user's actual email address.

## Cross-product use

The same TackWise account is intended to identify a user in TackWise Race and TackWise Analysis. Watch identity handling depends on its final connectivity model.

## Security principles

- Do not log identity tokens or secrets.
- Enforce authorization independently of authentication.
- Never infer ownership from email address.
- Keep Apple/Supabase configuration and secrets outside source control.

## M2 native implementation (stacked on PR #16; integration disabled)

This implements the existing Apple → Supabase UUID decision, without changing
ADR-003 identity/24-hour creation-intent semantics or accepting ADR-007. PR #14's
separate local/cloud race identity remains unchanged. No Worker/session injection
or race upload is enabled. The account panel is optional, in Setup; recording,
GPS, analysis and local race management never depend on its availability.

### Apple and Supabase boundary

The local `TackWiseAuth` Capacitor 8.4.3 plugin uses AuthenticationServices,
Security and CryptoKit only. Each explicit sign-in generates 32 random bytes via
`SecRandomCopyBytes`, encodes them as a 64-character lowercase hexadecimal raw
nonce, and sends **lowercase hex SHA-256(raw nonce UTF-8)** to Apple's request.
A separate random state binds the native delegate response. It requests no
email/full-name scopes. Cancellation discards the pending nonce/state.

The JS adapter checks nonce/subject association as a regression/shape guard, not
as token verification. The official `@supabase/auth-js` 2.118.0 client calls
`signInWithIdToken({ provider: 'apple', token, nonce: rawNonce })`. Supabase must
verify signature, issuer, audience and nonce; do not disable provider nonce checks.
Only the authenticated Supabase `user.id` UUID becomes `Session.ownerId`.
The Apple opaque user identifier is retained only to query credential revocation,
never as account/race ownership. Email/name and provider token/profile objects
are discarded rather than copied to persistence or UI.

The Auth-only SDK avoids database/storage/realtime dependencies. Its persistence,
URL detection, debug and automatic refresh are off; each bounded operation uses
an isolated memory-only client, disposed after completion. Auth traffic goes
through native HTTP with exact configured HTTPS origin, only id-token/refresh,
get-user and current-session logout routes, no redirects, and 15-second transport
timeouts. The SDK may make bounded transient retries within one refresh operation;
there is no application background timer or reconnect sync loop. Only public
publishable/legacy anon configuration is accepted. No Apple key, service role,
password flow or browser authentication fallback is implemented.

### Keychain and lifecycle

A fixed app-private generic-password item stores one minimized envelope:
Supabase owner UUID, access/refresh tokens, expiry, opaque Apple user ID,
configuration project origin and format version. The native envelope adds a
revision. Protection is **kSecAttrAccessibleWhenUnlockedThisDeviceOnly**, with
**kSecAttrSynchronizable = false**, no shared access group. It is suitable for
explicit foreground use; the provider refuses sessions while offline/backgrounded.
No tokens enter localStorage, IndexedDB, Filesystem, UserDefaults or logs.
Capacitor `loggingBehavior: 'none'` disables both native bridge result logging and
JS bridge argument/result logging, including debug builds. Errors expose categories
only. There is no token-bearing diagnostics UI or SDK debug logger.

- Restore reads Keychain, checks format/project, checks Apple credential state,
  then verifies the user with Supabase or refreshes an expiring session. Offline
  restoration retains protected credentials but exposes no usable bearer. Local
  races remain available. No Apple sign-in sheet opens automatically.
- `NativeAccountSession.current(refresh?)` implements PR #16's `SessionProvider`.
  It returns only the UUID and current bearer. Refreshes coalesce and require the
  same owner; the rotated token pair is saved before it can be exposed. Explicit
  refresh attempts have a 30-second retry guard. Invalid/revoked credentials clear
  the session; unknown/temporary outcomes fail closed and allow later foreground
  recovery. The Worker client's existing single 401 refresh is compatible.
- Logout increments the in-memory generation immediately, clears memory, and
  atomically writes a Keychain signed-out tombstone with a new revision before
  best-effort Supabase **local-scope** session revocation. A native non-secret
  logout-pending boolean prevents restoration if Keychain is temporarily locked.
  Stale native writes must match the old revision and fail after logout. Delayed
  Apple/refresh/restore responses cannot restore the logged-out client session.
  If persistence fails, the UI requests retry; it does not claim durable success.
- Offline logout still clears locally. Server revocation cannot be guaranteed
  after a lost/offline request; no credential is retained outside Keychain to
  retry it. Existing JWT validity ends according to the server policy, not by
  deleting a client copy. No claim of immediate global revocation is made.
- Account switching requires explicit logout then explicit Apple sign-in. Apple's
  native sheet uses the device's Apple account; there is no arbitrary email/account
  chooser. New Supabase owners cannot resume another owner's M2 checkpoint.
  Logout never edits/deletes local races, immutable gzip artifacts or receipts.
- Keychain can outlive uninstall: a non-secret app-install marker in UserDefaults
  causes orphaned credentials to be purged on first auth access after reinstall.
  An upgrade keeps the marker and item. Device-only Keychain does not migrate to
  another device. Missing/corrupt storage and different project config fail closed.
  Same-device restore, reinstall/upgrade, locked-device behavior and abrupt-power-loss
  durability still require physical-device evidence; no backup/restore guarantee
  is inferred from unit tests. Restoring an old backup is not a logout-revocation
  mechanism. Cloud deletion/retention decisions are unchanged.

### External setup and device prerequisites — no configuration performed

1. Obtain approval for an isolated Supabase test project and Apple test setup.
   Enable Apple's provider with the existing native **Bundle ID as an allowed
   client ID/audience**, keeping nonce verification enabled. Verify the approved
   provider allows email-optional sign-in (`email_optional`) because no email
   scope is requested; do not add email/name collection to work around setup.
   Keep other end-user login providers disabled, matching the Apple-only decision. Confirm repeated
   sign-in/Hide My Email resolve to the same Supabase UUID and the existing
   account lifecycle trigger behavior. Do not derive identity from email.
2. Under separate approval, enable Sign in with Apple for the existing Apple App
   ID, add the `com.apple.developer.applesignin = [Default]` entitlement to the
   signed app and matching provisioning profile. This PR does not change App IDs,
   capabilities, signing profiles or developer/project configuration. The unsigned
   app compiles without these; live Apple sign-in does not work until configured.
3. Supply only the approved project's public values through untracked `.env.local`:
   `VITE_SUPABASE_URL` (exact HTTPS origin, no trailing slash/path) and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable key or legacy anon key). Both are
   bundled public configuration, never privileged secrets. No values/default
   endpoints are committed. Web stays disabled even with these values. Native-only
   ID-token sign-in needs no app-shipped Apple private key or OAuth client secret;
   separate web OAuth/Services ID setup remains a separate task.
4. Rebuild and synchronize iOS with the same public config; inspect the final bundle
   for privileged credentials and confirm bridge logging remains off. Run on a
   physical iPhone in the approved environment: success/cancel/repeat/Hide My Email,
   correct UUID and nonce rejection, expiry/rotation, offline/airplane mode,
   Apple revocation/device account change, logout during delayed requests and
   restart, lock/unlock, app kill, upgrade/reinstall and backup/restore (same/new
   device). Verify no tokens in logs/browser/files and no cross-owner reuse.
5. Recheck offline recording/GPS/motion/Keep Awake, existing analysis/export and
   local data after logout. No real GPS upload is needed for auth tests. Worker
   sync remains disabled; M1/D5/D6 and physical transport/storage evidence from
   PR #16 remain separate gates before any upload activation.

### Evidence and sources

Injected tests cover nonce tampering, real SDK token/refresh/user/logout requests,
protected persistence, offline/restart, errors/revocation, refresh concurrency,
logout races, owner switching and coordinator checkpoint preservation. Native
source checks and an unsigned Xcode build verify inclusion/compilation, not real
Apple, Keychain hardware behavior or Supabase acceptance. No live auth performed.

Official references reviewed for this implementation:
[Apple native authentication](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple),
[Apple nonce](https://developer.apple.com/documentation/authenticationservices/asauthorizationopenidrequest/nonce),
[Apple device-only Keychain protection](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly),
[Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple),
[Supabase ID-token exchange](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken),
[Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[Supabase nonce verification implementation](https://github.com/supabase/auth/blob/master/internal/api/token_oidc.go).
