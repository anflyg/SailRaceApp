# Privacy Design

## Privacy-by-design/default rules

- Treat GPS, course/mark position and race location data as personal data.
- Keep race data private by default.
- Use opaque UUIDs for users and races.
- Do not put names or email addresses in object-storage keys.
- Minimize collection of identity information.
- Do not collect location outside race recording without a documented product need.
- Do not log personal/location data unless needed for a documented diagnostic/security purpose.
- Provide architecture paths for race deletion, account deletion and data export.
- Avoid public sharing, live tracking, marketing analytics or profiling by default; such features require a new privacy/security assessment.

## Authentication minimization

Sign in with Apple is the only planned end-user authentication method. TackWise should rely on the Supabase user UUID as canonical identity and should not require a user's real email address or name for core functionality.

Apple Hide My Email must work without loss of product functionality.

## Product analytics

Product analytics may be introduced only as a separate, minimized non-location dataset: app version, feature-use event, operational outcome, safe error category, and bounded performance/duration measurement. Do not repurpose telemetry or race-analysis data. No SDK, provider or collection is approved yet; legal basis/consent, processor/transfers, event schema, retention/deletion, access controls, inventory/processing-record and privacy-notice updates must be approved first.

## Entitlement minimization

Use the opaque Supabase UUID and server-maintained product plan, access source, status/expiry and counter only. Beta access requires a non-null future expiry and remains revocable before then. Do not store Apple transaction details, TestFlight tester data or client device/build claims unless a reviewed implementation proves necessity. Client-reported TestFlight status cannot authorize beta access.

## Data access

Authentication proves identity; authorization must independently prove that the authenticated user may access a specific race/object.

Supabase RLS and server-side ownership checks are required for user-owned data.

R2 objects are private and must only be served through an authorized, short-lived mechanism after ownership validation.

## Race upload minimization

The first sync protocol is initiated only for a completed local race and never affects recording availability. The phone sends a versioned, gzip-compressed raw object through an authenticated Worker; the client never receives R2 credentials or supplies an object key. The Worker derives ownership from the validated Supabase UUID, applies compressed/expanded/schema limits, verifies the compressed SHA-256, and makes the object eligible for use only after server-authoritative database acceptance.

Pre-acceptance reservation data is limited to opaque UUIDs, raw version, compressed digest/size, server-derived key, necessary structured race metadata, and expiry. The first raw format excludes local display names, email, Apple/TestFlight identity, advertising identifiers, and unrelated device/sensor data. Unaccepted objects remain private and follow bounded cleanup. Product analytics must not be embedded in upload payloads or operational upload logs.

## Free/paid entitlement privacy

The first-three-races free rule should be enforced using account entitlement/counter state. Do not introduce fingerprinting, advertising identifiers or cross-device tracking beyond the authenticated TackWise account merely to prevent free-tier abuse.

## Export and deletion

The architecture must support:
- export of user-owned structured metadata and raw race recordings in a portable form,
- deletion of one race across PostgreSQL and R2,
- deletion of pending upload reservations and unaccepted R2 objects for that race/account,
- deletion of the whole TackWise account and associated cloud data subject to documented legal retention.

## Diagnostics

Prefer diagnostic events such as opaque race ID, operation, error category, byte count and format version. Raw telemetry, exact GPS samples, auth tokens and secrets must not be written to normal logs.

## New-feature review triggers

A new privacy/security assessment is required before introducing:
- public or link-based race sharing,
- live location tracking,
- team/coach access to another user's data,
- marketing analytics or advertising SDKs,
- social/profile discovery,
- new personal-data categories or continuous background location beyond the product need.
