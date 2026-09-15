# Threat Model

**Status:** Living baseline for current TackWise cloud design.

## Assets

- Apple/Supabase user identity and authenticated sessions,
- GPS and race telemetry,
- race metadata and analysis results,
- free/paid licence entitlements,
- R2 objects and object access mechanisms,
- Supabase/Cloudflare/Apple credentials and server secrets,
- integrity of sync and analysis results.
- minimized product analytics data and any analytics credentials,
- App Store and beta entitlement state.
- pending race-upload reservations and unaccepted private R2 objects.

## Trust boundaries

- iPhone app to TackWise API,
- browser/Analysis app to TackWise API,
- Apple identity provider to Supabase Auth,
- TackWise API/Workers to Supabase,
- TackWise API/Workers/analysis jobs to private R2,
- client-local race data to cloud synchronization,
- future billing provider to entitlement state.
- client/API to analytics collection, if approved,
- App Store verification and privileged beta-entitlement administration to entitlement state.
- authenticated iPhone prepare/content/finalize requests through the Worker to private R2 and the PostgreSQL acceptance transaction.

## Key threats and baseline mitigations

### Broken object-level authorization / IDOR

**Risk:** One authenticated sailor accesses another sailor's race by guessing or substituting IDs.

**Mitigations:**
- opaque UUIDs,
- Supabase RLS on every user-owned table,
- server-side ownership checks for service-role operations,
- object access issued only after authenticated ownership validation,
- no trust in client-supplied `user_id`.
- globally reserved race UUIDs scoped to the validated user at every upload phase,
- server-derived R2 keys; race UUID or object-key knowledge never grants access.

### Exposure of GPS/location data

**Risk:** Personal location/race tracks become public or leak through logs/object URLs.

**Mitigations:**
- R2 objects are private,
- no public bucket/listing,
- short-lived object-specific access only after authorization,
- no names/emails in object keys,
- no raw GPS payloads in ordinary logs,
- explicit deletion/export design.
- unaccepted objects are not application-readable and are removed by bounded, idempotent cleanup.

### Session/account theft

**Risk:** Stolen session permits access to cloud race history.

**Mitigations:**
- Sign in with Apple through supported Supabase flow,
- no custom password database,
- tokens/secrets never logged,
- secrets kept out of client bundles and source control,
- normal session expiry/logout behavior tested.

### Service-role or infrastructure secret leakage

**Risk:** A leaked service key bypasses RLS or exposes storage.

**Mitigations:**
- service role only in trusted server-side configuration,
- never ship service keys to iPhone/browser,
- minimum required credentials/permissions,
- rotate compromised secrets,
- review logs/CI/configuration for accidental disclosure.

### Malicious or malformed race uploads

**Risk:** Oversized/corrupt payloads cause parser failure, excessive cost or compromise.

**Mitigations:**
- authenticated upload,
- preliminary entitlement check before transfer and authoritative recheck at finalize,
- separate hard limits for declared/actual compressed bytes, expanded bytes, samples/events and processing time,
- bounded gzip decompression that aborts before the expanded limit to resist gzip bombs,
- UTF-8, JSON, schema/format version, numeric/range and timestamp validation,
- SHA-256 integrity metadata,
- safe parser behavior and bounded analysis resources,
- reject conflicting content for an existing immutable race UUID,
- no accepted database row and no free-counter consumption until the validated object exists.

### Free-tier/licence abuse

**Risk:** Client manipulates counters or parallel uploads exceed free allowance.

**Mitigations:**
- server-authoritative entitlement state,
- service-role-only PostgreSQL acceptance operation that locks the entitlement and reservation,
- unique race UUID plus atomic race insert/free-counter update for exactly-once first-three-races accounting,
- no client writes to entitlement/counter fields,
- rate/abuse controls at API boundary.

### Replayed requests and cross-store inconsistency

**Risk:** Retries, concurrent finalize calls, lost responses, or an R2/database partial failure create duplicate races, double-consume free allowance, expose orphaned objects, or lose an accepted recording.

**Mitigations:**
- race UUID as the idempotency identity and immutable prepared version/digest/size,
- identical prepare/content/finalize retries return or converge on the same result,
- row locking and unique constraints in the authoritative acceptance transaction,
- R2 object validated and stored before database acceptance,
- unreferenced private objects remain inaccessible and recoverable by retry,
- scheduled cleanup rechecks accepted references before deleting expired objects,
- analysis begins only from an accepted `races.sync_state = uploaded` row.

### Paid/beta entitlement forgery

**Risk:** A client claims paid or TestFlight access, or obtains indefinite beta access.

**Mitigations:**
- server-controlled `plan`, `access_source`, status and expiry,
- no trust in client `isTestFlight`/build flags,
- UUID-scoped, expiry-bounded beta allowlisting and server revocation,
- operator-only, narrowly scoped beta mutation with durable, minimized server-only audit evidence; no public admin HTTP endpoint,
- server-side App Store verification before `access_source = app_store`,
- beta and paid access never consume the atomic free counter.

### Analytics over-collection

**Risk:** An SDK, event schema or provider leaks location/race data or creates unapproved profiling.

**Mitigations:**
- provider/SDK is deferred,
- separate minimized non-location event flow,
- prohibit GPS, race payloads, tokens, secrets, Apple identifiers and email,
- privacy/security, retention and legal-basis review before collection.

### Dependency compromise

**Risk:** Third-party package or service vulnerability affects TackWise.

**Mitigations:**
- minimize dependencies,
- lock/version dependencies,
- keep supported versions updated,
- maintain vulnerability handling and security-update process,
- document material new external trust/dependency decisions.

### Denial of service / cost abuse

**Risk:** Repeated uploads/analysis create unexpected Cloudflare/Supabase cost.

**Mitigations:**
- authentication before expensive operations,
- file size and processing limits,
- rate limiting/abuse detection where required,
- cache/store reusable analysis results rather than recompute on every view,
- bounded staged-object retention and orphan cleanup,
- monitor usage/cost before scaling paid tiers.

## Race safety boundary

Cloud compromise or outage must not prevent race-critical local functions such as timer, GPS, speed, VMG and recording. Cloud services are synchronization/analysis infrastructure, not a required control path during racing.

## Reassessment triggers

Update this threat model before introducing:
- public/live race sharing,
- team/coach access to another user's races,
- social features,
- payment/billing integrations,
- new sensors or personal-data categories,
- public APIs,
- substantially different cloud/storage architecture.
