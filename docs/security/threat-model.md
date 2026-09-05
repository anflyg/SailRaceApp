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

## Trust boundaries

- iPhone app to TackWise API,
- browser/Analysis app to TackWise API,
- Apple identity provider to Supabase Auth,
- TackWise API/Workers to Supabase,
- TackWise API/Workers/analysis jobs to private R2,
- client-local race data to cloud synchronization,
- future billing provider to entitlement state.

## Key threats and baseline mitigations

### Broken object-level authorization / IDOR

**Risk:** One authenticated sailor accesses another sailor's race by guessing or substituting IDs.

**Mitigations:**
- opaque UUIDs,
- Supabase RLS on every user-owned table,
- server-side ownership checks for service-role operations,
- object access issued only after authenticated ownership validation,
- no trust in client-supplied `user_id`.

### Exposure of GPS/location data

**Risk:** Personal location/race tracks become public or leak through logs/object URLs.

**Mitigations:**
- R2 objects are private,
- no public bucket/listing,
- short-lived object-specific access only after authorization,
- no names/emails in object keys,
- no raw GPS payloads in ordinary logs,
- explicit deletion/export design.

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
- entitlement check before expensive processing,
- maximum upload size,
- schema/format version validation,
- SHA-256 integrity metadata,
- safe parser behavior and bounded analysis resources,
- reject conflicting content for an existing immutable race UUID.

### Free-tier/licence abuse

**Risk:** Client manipulates counters or parallel uploads exceed free allowance.

**Mitigations:**
- server-authoritative entitlement state,
- atomic first-three-races accounting,
- no client writes to entitlement/counter fields,
- rate/abuse controls at API boundary.

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
