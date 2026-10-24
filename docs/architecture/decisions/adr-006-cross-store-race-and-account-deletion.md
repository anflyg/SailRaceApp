# ADR-006: Cross-store race and account deletion

**Status:** Accepted architecture; implementation deferred to roadmap steps D2–D6.

**Date:** 2026-10-15

## Context and scope

Race and analysis data spans PostgreSQL and private Cloudflare R2. PostgreSQL transactions cannot atomically delete R2 objects, and a database cascade can erase the only durable object reference before external deletion is known to have succeeded. Race GPS, position, telemetry and associated race data are personal data. ADR-003 requires race and account deletion; ADR-004 additionally requires safe cleanup of uploads and tombstones that prevent orphan recovery from being undone by delayed inserts.

This ADR defines deletion of accepted race rows, `analysis_runs`, raw race objects, derived analysis-result objects, upload reservations, abandoned/orphan upload state and orphan-recovery tombstones. Account deletion also covers existing `profiles`, `entitlements`, `entitlement_admin_audit`, Supabase Auth identity and related account state. It covers individual race deletion and account deletion. It adds architecture only: it does not implement a worker, RPC, migration, public/admin deletion control plane, or production operation. Exact state names and signatures remain implementation details.

## Decision

### Deletion invariants

Deletion must be retryable, observable, idempotent under duplicate execution, bounded in automatic retries, safe under partial provider failure, stale queue messages, and late/in-flight writes. The system must fail closed on uncertain identity or provider outcomes and must never claim successful deletion solely because a retry budget expired.

**Delete external objects before removing relational references needed to find them.** Before deleting or cascading relational rows that carry required R2 references, the deletion workflow must durably retain the exact private object identities needed for cleanup. Raw and derived-result R2 objects must reach a known outcome or a durable retry/recovery state before those references are removed. Relational cleanup follows only after external deletion is proven or durably reconciled. PostgreSQL `ON DELETE CASCADE` must not be the first step if it can destroy the only R2 reference.

Missing objects count as successful absence only when the exact object identity is known. An identity mismatch, ambiguous provider response, or uncertain delete must fail closed and preserve required references for reconciliation. A successful R2 delete followed by uncertain database completion is recovered from durable state; a completed database transition followed by an uncertain client/operator response is retried idempotently. Do not blindly repeat destructive operations without checking durable state.

### Durable deletion lifecycle

Use a durable lifecycle with states equivalent to `active`, `deletion_requested`, `deleting_objects`, `deleting_relational`, `completed`, and `error`. Exact implementation names may differ. State must atomically block new lifecycle work before cleanup begins and permit bounded claim/retry by trusted server-side workers.

Deletion records contain only the minimum operational and integrity state required: opaque race/account ownership identity where needed, lifecycle state, bounded attempt/timing/category data, and exact object references only while needed to complete or recover external deletion. Do not put race telemetry, GPS, provider bodies, credentials, tokens, or unnecessary digests/identifiers in deletion records. Keep references no longer than required by the deletion workflow and reviewed recovery obligations.

### Race deletion sequence

For a race UUID, the intended idempotent sequence is:

1. Request deletion for the race UUID and durably record the request.
2. Atomically block new lifecycle work for the race.
3. Stop new analysis dispatch and processing.
4. Preserve exact current raw and derived-result object references needed for deletion.
5. Delete the raw R2 object if present.
6. Delete derived analysis-result R2 objects if present.
7. Reconcile uncertain provider outcomes using the retained references and durable state.
8. Delete or close `analysis_runs` after their object references are no longer needed.
9. Delete accepted race metadata.
10. Remove reservations and abandoned/orphan state when safe.
11. Handle any orphan-recovery tombstone under the tombstone rule below.
12. Mark deletion complete only after all covered personal data is deleted, except where a separately documented and applicable lawful-retention exception explicitly permits retaining specified data.

Each step must be safe to repeat or resume after interruption. Automatic retry exhaustion, unresolved provider uncertainty, or operator review alone is not deletion success. If personal data remains because a provider outcome is uncertain and no separately documented lawful-retention exception applies, deletion remains unresolved and must not be marked complete.

### Account deletion sequence

Account deletion orchestrates deletion of all user-owned race data and related account state covered by this ADR:

1. In the same transaction that records the account-deletion request, lock and close the existing account gate first, before acquiring any other lifecycle-row locks. Follow the global order **account gate → race gate → existing lifecycle locks**. This atomically prevents later admission, including requests carrying previously issued JWTs; JWT validity alone does not override a closed gate. Then record deletion state and prevent new uploads and analysis work.
2. Enumerate owned deletion units server-side, including accepted races, pending reservations/orphans, `profiles`, `entitlements`, `entitlement_admin_audit`, Supabase Auth identity and related account state.
3. Process race deletions in bounded batches, durably recording progress and retrying partial failures.
4. Expose safe operator-observable aggregate progress and terminal errors without identifying payloads in normal logs.
5. Delete personal profile, entitlement and related account state when their deletion dependencies are resolved, except data covered by a separately documented applicable lawful-retention exception. Prevent cascades from deleting required race/R2 references.
6. Keep canonical identity/Auth mapping available while required ownership or object references depend on it; remove Supabase Auth identity and related Auth state only after those dependencies are resolved. Auth deletion timing is implementation-specific, but neither `auth.users` deletion nor database cascades may destroy required race/R2 references prematurely.
7. Handle `entitlement_admin_audit` as minimized operational audit data with a separately justified retention period and access restriction; it is not a basis for retaining broader account/race data. Remove direct account linkage where feasible without defeating a documented audit purpose. Delete or further minimize it when its period expires, and document the scope of any applicable legal-retention exception.
8. Complete account deletion only when all covered personal data is deleted, except data explicitly covered by a separately documented applicable lawful-retention exception. Provider uncertainty or operator review alone does not permit completion; unresolved personal data keeps deletion unresolved and must be escalated for operator/privacy review.

The current proposed account-deletion target and any legally required exceptions remain governed by [the retention policy](../../privacy/retention-policy.md) and must be confirmed before public production use.

After full account deletion, a later registration requires a new Supabase Auth identity. No separate account-incarnation component is introduced. The Auth behavior that ensures re-registration receives a new UUID, and backup restoration that could restore an old identity or open gate, are verification requirements; they are not assumed guarantees. Existing accounts require a controlled gate backfill based on verified ownership and deletion status. Missing or ambiguous gates remain closed and are never automatically opened during login or API use.

### Resurrection protection

While deletion is pending or complete, cloud-race creation, prepare/finalize and all other covered operations must not recreate deleted race state; analysis dispatch must not enqueue new work; a processing consumer must not process deleted/deleting races; stale queue messages become safe no-ops; late database inserts fail closed; and stale/in-flight object writes must not recreate accepted data. Cloud race UUIDs are issued only by the authenticated, idempotent server creation flow defined by ADR-003. Missing or closed gates never cause a gate or identity to be recreated from an incoming UUID. The product owner accepts the astronomically small UUIDv4 collision/reissue probability and rejects a central allocator, UUIDv8 scheme and global UUID denylist. This probabilistic identity decision does not weaken ownership checks, deletion fencing or the rule that a deleted identity cannot be reopened through ordinary operations. A server-issued creation-intent attestation remains usable for 24 hours from its issuance; deletion/recovery must preserve the gate and other necessary protection until all such valid attestations are expired or otherwise safely handled and external writes are resolved. Pruning temporary intent rows does not make an unexpired attestation invalid, and an expired attestation must not cause automatic renewal or identity creation. Safe removal/retention of gate state remains open until D5/D6 design and evidence are complete.

### Orphan-recovery tombstones

ADR-004 requires server-only tombstones after `orphan_object_absent` and `orphan_object_present_matching` recovery, preventing a delayed insert from accepting the recovered race UUID after its reservation is removed. Tombstone removal is allowed only after the deletion workflow proves all of the following:

Migration 00012 stores these recovery records keyed by `race_id` without durable user ownership. Because account deletion must enumerate tombstones after reservation removal, a minimized server-only ownership association must be established and retained until safe deletion. D2 must implement that association before the deletion workflow is enabled. Existing unlinked tombstones fail closed and require reviewed reconciliation; ownership must never be inferred without authoritative evidence.

- all other account/race deletion steps have reached their defined terminal boundary, with tombstone removal itself as the remaining integrity step;
- no accepted race or reservation exists;
- no active cleanup/recovery lease or content-write lease exists; lease absence alone is not sufficient proof of safety;
- no analysis work remains capable of restoring state;
- no referenced raw or derived object remains; and
- an enforceable fencing/non-resurrection mechanism covers every relevant insert and object-write path, including delayed writers that may outlive a lease, and D2–D6 implementation/tests demonstrate it prevents stale/in-flight writes from creating accepted state.

Absence of currently active leases, a grace period, or operator review alone is not an enforceable fence. If the mechanism and its non-resurrection behavior cannot be implemented and demonstrated, retain the required integrity protection, keep deletion/recovery unresolved as appropriate, and escalate for operator/privacy review. Do not let a stale operation deliberately reissue or reopen a deleted identity. The astronomically small UUIDv4 collision/reissue probability is explicitly accepted as stated above; it does not grant authorization or bypass a live uniqueness constraint. Indefinite tombstone retention is not approved as the intended steady state; D2–D6 must implement and prove a reviewed safe-removal path before deletion can complete for affected state. Intentional reuse of an existing cloud UUID is not approved.

An `accepted_match` recovery does not create an orphan tombstone because the accepted race already exists and its object must not be deleted; normal race deletion still follows this ADR's lifecycle and safe-resurrection rules.

### Provider uncertainty, retries and recovery

Use finite automatic retries with bounded exponential backoff and jitter. Persist each retry transition and preserve object references necessary for another attempt. After exhaustion, persist a terminal error/recovery state, retain required references and require operator recovery. Do not claim deletion complete while covered personal data remains unresolved, unless a separately documented applicable lawful-retention exception explicitly applies. Operator review alone is not deletion success. Unresolved state must remain observable and be escalated for operator/privacy review.

### Privacy, security, GDPR and CRA

Treat race UUIDs, user UUIDs, R2 object references and deletion audit/state as pseudonymous personal or operational data where applicable. Minimize deletion records and retain exact object references only as long as needed for safe completion/recovery. Do not log user UUIDs, race UUIDs, object keys, digests, GPS, telemetry, provider response bodies, secrets or tokens. Normal application logs use safe aggregate counts, timings and bounded result/error categories only. No public/admin deletion HTTP endpoint is introduced; trusted server-side operations and reviewed operational tooling are outside the public client surface.

Deletion is part of privacy-by-design/default and must be included in pre-beta GDPR/CRA operational evidence. The privacy inventory and retention policy identify deletion/recovery state as server-only operational data; exact retention periods, legal exceptions, backup behavior and safe tombstone-removal evidence must be confirmed before public production use. This ADR makes no legal conformity claim and does not approve indefinite retention.

Required safe operational evidence includes deletion requested/completed counts, retries, terminal deletion errors, pending-deletion age, object-deletion result categories and account-deletion progress. Do not attach identifying payloads to ordinary logs or metrics.

## Delivery sequence and beta gate

The implementation sequence is tracked in the [race-upload implementation roadmap](../race-upload-implementation-roadmap.md):

- **D1 — ADR-006 cross-store deletion design.** This accepted architecture decision.
- **D2 — Deletion lifecycle database foundation and service-role RPCs, including durable minimized ownership association for orphan-recovery tombstones.** Depends on D1; fail closed on unlinked legacy tombstones and require reviewed reconciliation. Complete D2 before enabling the deletion workflow.
- **D3 — Race deletion worker and R2 reconciliation.** Depends on D2.
- **D4 — Account deletion orchestration.** Depends on D3.
- **D5 — Enforceable fencing/resurrection protection across upload/analysis lifecycle.** May be developed alongside D3/D4, but must be complete before D6.
- **D6 — Isolated non-production deletion drill and evidence.** Depends on D2–D5 and must demonstrate tombstone ownership enumeration, safe-removal fencing, non-resurrection, unresolved-provider behavior, and account-scope deletion/retention handling.

ADR-006 is architecture only; no deletion implementation exists from this ADR yet. Acceptance does not imply beta or production readiness. Beta remains blocked until implementation and a demonstrated deletion drill are complete, together with the required privacy/security and operational review.

### Open implementation and retention questions

The following details remain open for D2–D6 and cannot weaken the invariants above:

- The exact schema/RPC design for the server-only tombstone ownership association and the authoritative evidence/workflow for reconciling existing unlinked migration-00012 records.
- The concrete enforceable fencing mechanism across database insert and external object-write paths, including how it fences a delayed writer that outlives its lease; it must be implemented and demonstrated before tombstone removal.
- The account lifecycle and gate provisioning/reactivation rules; attestation claims, format, key management and revocation/rotation behavior; old-client transition; restore/replay behavior; and safe removal/retention of gate, tombstone and creation-intent data. Attestation expiry is 24 hours from server issuance, but the safe-garbage-collection and restore mechanisms remain open. The accepted UUIDv4 collision probability does not resolve those lifecycle questions.
- Verify that Supabase Auth re-registration after full deletion creates a distinct user UUID, and that backup recovery cannot restore a deleted identity or reopen its gate. These are required tests and operational evidence, not current provider guarantees.
- The exact lawful basis, scope and retention period for any retained personal data, minimized operational audit records, and provider backups.
- The implementation-specific ordering for deleting Supabase Auth identity after all required ownership and object references have been resolved.

## Consequences

- Cross-store deletion retains enough durable state to recover from R2/PostgreSQL partial failure without losing the only object reference.
- Race and account deletion can remain pending through bounded automatic retries and require safe operator recovery after exhaustion.
- Tombstones protect recovered UUIDs until deletion proves safe removal; they cannot be treated as ordinary audit rows or silently discarded.
- Additional server-only state is pseudonymous personal/operational data and requires minimized fields, justified retention, access controls and safe observability.
- No runtime behavior, migration, resource or deployment changes are made by this ADR.
