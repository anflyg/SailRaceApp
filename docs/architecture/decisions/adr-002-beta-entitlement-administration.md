# ADR-002: Operator-only beta entitlement administration

**Status:** Accepted, implementation deferred.

**Date:** 2026-09-13

## Context

ADR-001 establishes a server-controlled, UUID-scoped, explicitly expiring and revocable beta allowlist. It also requires least privilege and durable, minimized audit evidence. The initial API deliberately has no privileged administration endpoint or operator-authentication mechanism, so an implementation cannot safely infer either one from an end-user session, TestFlight state, or a client build claim.

## Decision

### Operator-only tooling, not a public API

Initial beta administration uses an operator-only CLI/tooling path. It must not expose a general public administration HTTP endpoint through the TackWise API. Normal users and clients have no entitlement mutation access.

The operator tooling requires an explicitly supplied server-side operator credential at execution time. Credentials must never be committed, placed in normal repository configuration, included in client code, or logged. Existing trusted server credentials may be used initially where necessary, but a dedicated least-privilege credential is preferred when it can be introduced without disproportionate complexity. Wider production administration requires a later review of a stronger dedicated operator identity/authentication mechanism.

### Narrow beta-only mutation

The tooling invokes a narrowly scoped server-side/database operation rather than allowing arbitrary writes to `entitlements`. It accepts only an explicit Supabase user UUID and the following operations:

- **Grant:** requires an explicit future `valid_until`; sets `plan = pro`, `access_source = beta`, and `status = active`; preserves `free_races_used`.
- **Revoke:** applies only to an existing beta entitlement; sets `status = revoked`; preserves `plan = pro`, `access_source = beta`, `valid_until`, and `free_races_used`.

The operation must inspect the current entitlement before changing it and reject attempts to overwrite or repurpose `access_source = app_store`. It must validate UUID and timestamp inputs, require a non-null future expiry for grants, and retain revocation as state rather than deleting entitlement history. It must not accept normal end-user authorization, client/TestFlight/build flags, Apple identity data, or receipt presence as authority.

### Durable, minimized audit evidence

Each successful beta grant or revoke records a dedicated server-only entitlement-administration audit event, atomically with the entitlement mutation where practical. This audit data is security/operational evidence, not product analytics.

The future physical schema must retain only the minimum necessary evidence, such as:

- opaque audit-event UUID;
- target Supabase UUID;
- `beta_grant` or `beta_revoke` action;
- server-generated event timestamp;
- supplied expiry for a grant where relevant; and
- a stable, approved authority/operator identifier.

It must not retain email, Apple ID, TestFlight identity, auth tokens, secrets, GPS/race data, or other unnecessary personal data.

Audit data and the beta mutation operation are server/operator only. No `anon` or authenticated-user access is introduced; RLS and privileges must preserve the existing client boundary.

### Retention and privacy

Supabase UUIDs and the approved authority/operator identifier are pseudonymous personal data. When implemented, this audit dataset must be included in the privacy data inventory and processing record. Retain it only while operationally necessary for entitlement/account lifecycle and security traceability. A precise production retention schedule, access controls, and account-deletion/legal-obligation treatment require review before wider commercial launch; audit data must not be silently assumed to be deleted immediately with ordinary user content.

The administration mechanism and its audit evidence are part of TackWise security and CRA operational evidence.

## Consequences

- Beta access stays server-controlled, time-bounded, revocable, UUID-scoped, and independent of client/TestFlight/build claims.
- The free-race counter remains untouched by beta administration; beta access does not consume it.
- Initial administration has no public HTTP attack surface, but trusted operator execution and credentials become a privileged trust boundary.
- The implementation needs a reviewed narrow mutation operation, server-only audit storage, privilege/RLS design, input/error/logging controls, and grant/revoke/negative-path tests before release.
- No StoreKit, App Store Server API, automatic TestFlight detection, public admin API, race upload, analytics, subscription billing, or free-race consumption is specified or implemented by this ADR.

## Implementation decisions still required

Before implementation, select and review the concrete operator credential source, lifecycle, rotation and execution environment; the audit-record schema and its retention/access-control design; and the database transaction/privilege model that makes audit evidence and a permitted mutation atomic where practical. These choices must preserve the no-client-write boundary and avoid service-role credentials outside trusted operator/server execution.
