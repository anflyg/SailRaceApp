# GDPR Processing Record

**Status:** Initial engineering record; legal bases and final controller details require review before commercial launch.

## Core processing activities

### Account/authentication
Purpose: identify the user across TackWise services.
Data: Apple/Supabase identity data and opaque UUID.
Processors/providers: Apple, Supabase.

### Race synchronization and storage
Purpose: sync, backup, history and analysis requested by the user.
Data: race metadata and GPS/location telemetry.
Providers: Supabase, Cloudflare.

### Analysis
Purpose: calculate and present race-performance insights.
Data: race telemetry, course metadata and derived results.

### Product analytics (not yet collecting)
Purpose: improve product reliability and usability.
Data: minimized non-location events only: app version, feature use, operational outcome, safe error category, and bounded duration/performance measurement.
Providers: undecided; no provider/SDK is approved.
Conditions before collection: document lawful basis and any consent requirement, processor/transfer assessment, retention, event schema, security controls, and public privacy notice. Raw race/GPS telemetry, raw race payloads, Apple identifiers, email, tokens, secrets, advertising identifiers, marketing and profiling are outside this activity.

### Entitlement and beta access
Purpose: enforce the three-free-race allowance and authorized App Store/beta access, and provide security traceability for operator beta grants/revocations when implemented.
Data: opaque user UUID, commercial/product plan, access source, status, expiry and free-race counter. Beta-administration audit evidence is limited to opaque event/user UUIDs, action, timestamp, applicable grant expiry and an approved authority/operator identifier. Later App Store verification must minimize transaction data; beta administration uses UUID-scoped, mandatory-expiry authorization. Do not retain email, Apple/TestFlight identity, tokens, secrets or race data for this activity.
Providers: Supabase; Apple when StoreKit/App Store verification is implemented.

## Principles

- Collect only what is required for defined product purposes.
- Document lawful basis, retention and data transfers before production use.
- Maintain appropriate processor agreements/configuration with service providers.
- Reassess when adding analytics, marketing, sharing or social functionality.
- Update the public privacy notice and this record before collecting analytics or introducing billing verification.
