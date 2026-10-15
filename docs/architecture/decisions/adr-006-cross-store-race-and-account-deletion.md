# ADR-006: Cross-store race and account deletion

**Status:** Accepted architecture; implementation deferred to roadmap steps D2–D6.

**Date:** 2026-10-15

## Context and scope

Race and analysis data spans PostgreSQL and private Cloudflare R2. PostgreSQL transactions cannot atomically delete R2 objects, and a database cascade can erase the only durable object reference before external deletion is known to have succeeded. Race GPS, position, telemetry and associated race data are personal data. ADR-003 requires race and account deletion; ADR-004 additionally requires safe cleanup of uploads and tombstones that prevent orphan recovery from being undone by delayed inserts.

This ADR defines deletion of accepted race rows, `analysis_runs`, raw race objects, derived analysis-result objects, upload reservations, abandoned/orphan upload state and orphan-recovery tombstones. It covers individual race deletion and account deletion. It adds architecture only: it does not implement a worker, RPC, migration, public/admin deletion control plane, or production operation. Exact state names and signatures remain implementation details.

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
12. Mark deletion complete only after required data is deleted or has an explicitly reviewed terminal recovery disposition.

Each step must be safe to repeat or resume after interruption. An automatic retry exhaustion or unresolved provider uncertainty is an error/recovery state, not proof of deletion.

### Account deletion sequence

Account deletion orchestrates deletion of all user-owned race data covered by this ADR:

1. Mark the account/user deletion state first and prevent new uploads and analysis work.
2. Enumerate owned deletion units server-side, including accepted races and pending reservations/orphans.
3. Process race deletions in bounded batches, durably recording progress and retrying partial failures.
4. Expose safe operator-observable aggregate progress and terminal errors without identifying payloads in normal logs.
5. Complete account deletion only when all covered race/personal cloud data is deleted or has an explicitly reviewed terminal recovery disposition; exhaustion alone is not completion.
6. Do not remove canonical identity/auth mapping while required data references or ownership are still needed for deletion. Supabase Auth deletion timing is implementation-specific but occurs only after those dependencies are resolved.

The current proposed account-deletion target and any legally required exceptions remain governed by [the retention policy](../../privacy/retention-policy.md) and must be confirmed before public production use.

### Resurrection protection

While deletion is pending or complete, prepare/finalize must not recreate deleted race state; analysis dispatch must not enqueue new work; a processing consumer must not process deleted/deleting races; stale queue messages become safe no-ops; late database inserts fail closed; and stale/in-flight object writes must not recreate accepted data. Deletion state is checked at all relevant lifecycle boundaries and coordinated with active upload, cleanup and recovery leases. A deleted race UUID does not silently become reusable.

### Orphan-recovery tombstones

ADR-004 requires server-only tombstones after `orphan_object_absent` and `orphan_object_present_matching` recovery, preventing a delayed insert from accepting the recovered race UUID after its reservation is removed. Tombstone removal is allowed only after the deletion workflow proves all of the following:

- account/race deletion has reached its defined terminal deletion boundary;
- no accepted race or reservation exists;
- no active cleanup/recovery lease or content-write lease exists;
- no analysis work remains capable of restoring state;
- no referenced raw or derived object remains; and
- stale/in-flight writes can no longer create accepted state.

If any condition cannot be proven, keep the tombstone and do not silently reuse the UUID. Indefinite tombstone retention is not approved as the intended steady state; implementation must provide a reviewed safe-removal path. This ADR does not approve a general UUID reuse policy. Any future intentional reuse requires a reviewed recovery mechanism that cannot resurrect stale or late writes.

An `accepted_match` recovery does not create an orphan tombstone because the accepted race already exists and its object must not be deleted; normal race deletion still follows this ADR's lifecycle and safe-resurrection rules.

### Provider uncertainty, retries and recovery

Use finite automatic retries with bounded exponential backoff and jitter. Persist each retry transition and preserve object references necessary for another attempt. After exhaustion, persist a terminal error/recovery state, retain required references and require operator recovery. Do not claim deletion complete while covered personal data remains unresolved. Any terminal recovery disposition must be reviewed and observable; it is not inferred from elapsed time or exhausted attempts.

### Privacy, security, GDPR and CRA

Treat race UUIDs, user UUIDs, R2 object references and deletion audit/state as pseudonymous personal or operational data where applicable. Minimize deletion records and retain exact object references only as long as needed for safe completion/recovery. Do not log user UUIDs, race UUIDs, object keys, digests, GPS, telemetry, provider response bodies, secrets or tokens. Normal application logs use safe aggregate counts, timings and bounded result/error categories only. No public/admin deletion HTTP endpoint is introduced; trusted server-side operations and reviewed operational tooling are outside the public client surface.

Deletion is part of privacy-by-design/default and must be included in pre-beta GDPR/CRA operational evidence. The privacy inventory and retention policy identify deletion/recovery state as server-only operational data; exact retention periods, legal exceptions, backup behavior and safe tombstone-removal evidence must be confirmed before public production use. This ADR makes no legal conformity claim and does not approve indefinite retention.

Required safe operational evidence includes deletion requested/completed counts, retries, terminal deletion errors, pending-deletion age, object-deletion result categories and account-deletion progress. Do not attach identifying payloads to ordinary logs or metrics.

## Delivery sequence and beta gate

The implementation sequence is tracked in the [race-upload implementation roadmap](../race-upload-implementation-roadmap.md):

- **D1 — ADR-006 cross-store deletion design.** This accepted architecture decision.
- **D2 — Deletion lifecycle database foundation and service-role RPCs.** Depends on D1.
- **D3 — Race deletion worker and R2 reconciliation.** Depends on D2.
- **D4 — Account deletion orchestration.** Depends on D3.
- **D5 — Resurrection protection across upload/analysis lifecycle.** May be developed alongside D3/D4, but must be complete before D6.
- **D6 — Isolated non-production deletion drill and evidence.** Depends on D2–D5.

ADR-006 is architecture only; no deletion implementation exists from this ADR yet. Acceptance does not imply beta or production readiness. Beta remains blocked until implementation and a demonstrated deletion drill are complete, together with the required privacy/security and operational review.

## Consequences

- Cross-store deletion retains enough durable state to recover from R2/PostgreSQL partial failure without losing the only object reference.
- Race and account deletion can remain pending through bounded automatic retries and require safe operator recovery after exhaustion.
- Tombstones protect recovered UUIDs until deletion proves safe removal; they cannot be treated as ordinary audit rows or silently discarded.
- Additional server-only state is pseudonymous personal/operational data and requires minimized fields, justified retention, access controls and safe observability.
- No runtime behavior, migration, resource or deployment changes are made by this ADR.
