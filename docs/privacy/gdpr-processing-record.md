# GDPR Processing Record

**Status:** Initial engineering record; legal bases and final controller details require review before commercial launch.

## Core processing activities

### Account/authentication
Purpose: identify the user across TackWise services.
Data: Apple/Supabase identity data and opaque UUID.
Processors/providers: Apple, Supabase.

### Race synchronization and storage
Purpose: sync, backup, history and analysis requested by the user.
Data: versioned GPS/location telemetry and necessary race/course/sensor context in private compressed objects; opaque owner/race UUIDs, timestamps, duration/distance, raw version, compressed digest/size, object reference and short-lived upload-reservation metadata in PostgreSQL. The initial format excludes local display names and unrelated identity/device data.
Providers: Supabase, Cloudflare.
Retention/controls: accepted data follows user race/account deletion; prepared but unaccepted reservations expire after 24 hours and unreferenced private objects are targeted for cleanup within a further 24 hours. Every upload phase is authenticated and UUID-scoped; no client receives R2 credentials. Exact lawful basis, controller notice, processor/transfer configuration and backup deletion behavior require confirmation before end-user production use.

### Analysis
Purpose: calculate and present race-performance insights.
Data: race telemetry, course metadata and derived results.

[ADR-004](../architecture/decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md) adds accepted architecture, with implementation deferred: PostgreSQL-authoritative analysis runs and finite retry/lease state; transient Cloudflare Queues/DLQ messages containing only race UUID and analysis version; a trusted route-less consumer resolving private object metadata server-side. The envelope is pseudonymous personal data, separate from product analytics, and contains no user UUID, telemetry, object key or credentials.

Providers: Supabase for durable metadata; Cloudflare for Worker execution, transient delivery and private raw/derived R2. Browser access is through authenticated owner-scoped Worker APIs only. A bounded summary excludes GPS streams/raw tracks/internal fields; exact result metrics/schema remain later decisions. Operational logs exclude payloads, user UUIDs, keys, digests, tokens and provider bodies.

Retention/controls: preserve immutable raw and historical analysis versions until authorized deletion; define queue/DLQ/log retention and confirm processor/transfer/public-notice coverage before enablement. Abandoned-upload cleanup retains the approximately 48-hour target with the ADR's one-hour post-expiry grace and finite attempts. Before beta, a separate retryable cross-store race/account deletion design and demonstrated path must preserve object references across database deletion and provider uncertainty, with operational alerts/manual escalation after exhaustion.

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
