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

## Data access

Authentication proves identity; authorization must independently prove that the authenticated user may access a specific race/object.

Supabase RLS and server-side ownership checks are required for user-owned data.

R2 objects are private and must only be served through an authorized, short-lived mechanism after ownership validation.

## Free/paid entitlement privacy

The first-three-races free rule should be enforced using account entitlement/counter state. Do not introduce fingerprinting, advertising identifiers or cross-device tracking beyond the authenticated TackWise account merely to prevent free-tier abuse.

## Export and deletion

The architecture must support:
- export of user-owned structured metadata and raw race recordings in a portable form,
- deletion of one race across PostgreSQL and R2,
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
