# ADR-001: Privacy-first analytics and server-authoritative access

**Status:** Accepted, implementation deferred.  
**Date:** 2026-09-13

## Context

TackWise needs limited product telemetry to improve reliability and usability, paid access for cloud analysis, and beta access that does not consume the three free cloud races. GPS/race data is personal data and remains a private user dataset. The iPhone client cannot safely authorize paid or beta access.

## Decision

- Keep product analytics separate from the race-analysis dataset. Start only with minimized non-location events: app version, feature-use event, operational success/failure, safe error category, and bounded duration/performance measurement. Do not collect raw GPS, raw race payloads, Apple identifiers, email, auth tokens or secrets.
- Keep analytics-provider selection open. Any SDK/provider, event schema, retention period, legal basis, consent requirement, privacy notice and data-transfer assessment require approval before collection.
- Prefer Apple StoreKit / App Store In-App Purchase for the initial consumer paid-access path. The server will later verify App Store transactions/subscription state before granting `plan = pro` with `access_source = app_store`. Products, pricing and regional terms remain open. Web/alternative billing needs a separate App Store/commercial and architecture review.
- Use one server-controlled entitlement row. `plan` is the commercial/product tier (`free` or `pro`); `access_source` explains why it is authorized (`free`, `app_store`, or `beta`). Retain status, expiry, the existing free-race counter, and server-generated timestamps. This avoids coupling future Pro products or billing methods to a provider.
- Grant beta access only through a controlled server-side entitlement administration flow, initially a UUID-scoped allowlist with an explicit expiry. Do not trust an `isTestFlight`, build, receipt-presence, or similar client boolean/claim alone.

## Beta authorization analysis

StoreKit/App Store server verification can later provide signed transaction/subscription information and environment signals associated with transactions. It does not, by itself, provide a request-time proof that the authenticated Supabase UUID is an approved TestFlight tester, nor does a client build flag establish that proof. App Store Connect can administer TestFlight tester distribution, but linking a tester record to the TackWise UUID and turning that into access remains a controlled operational authorization problem.

The preferred initial mechanism is therefore a least-privilege, audited server-side allowlist keyed only by Supabase UUID, provisioned after a controlled tester-identity/UUID association and bounded by expiry. A beta entitlement is `plan = pro`, `access_source = beta`, `status = active`, and has a non-null future `valid_until`; it may be revoked before expiry. A later reviewed integration may reduce manual administration, but must preserve server authority, mandatory expiry/revocation, access review and no unnecessary storage of Apple/tester personal data.

## Consequences

- Free-race consumption is atomic and occurs only for successfully accepted cloud races. Paid/beta access never consumes it; local recording is always available.
- Billing and beta administration become security-sensitive privileged server operations. They require authorization controls, audit evidence with minimized metadata, test coverage, monitoring and revocation handling.
- Analytics is a new processing activity and cannot be silently added to operational logs or telemetry. A privacy notice, data inventory/record updates, retention and legal-basis assessment are prerequisites.
- No StoreKit, App Store Server API, webhook, analytics SDK, migration, beta authorization, or entitlement mutation is implemented by this ADR.
