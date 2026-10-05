# ADR-004: Analysis dispatch, lifecycle, reconciliation and abandoned-upload cleanup

**Status:** Accepted; implementation deferred to roadmap steps 6B–6G and subsequent result/API work.

**Date:** 2026-10-01

## Context and scope

[ADR-003](adr-003-first-race-upload-and-sync.md) requires analysis only after PostgreSQL commits an accepted race with `sync_state = uploaded`. It also requires retryable delivery, uniqueness for `(race_id, analysis_version)`, recovery of missed dispatch, immutable raw objects and safe abandoned-upload cleanup. This ADR records the approved concrete architecture for [roadmap step 6](../race-upload-implementation-roadmap.md); it does not authorize production enablement.

The reviewed `main` snapshots are:

| Repository | Commit | Relevant state |
| --- | --- | --- |
| `anflyg/SailRaceApp` | `1cb2dad0f028d1f193a04defc4ae095f66226c74` | ADR-003 and suite security/privacy requirements |
| `anflyg/tackwise-api` | `f2baed9765c4fd078990d4f02ee9bc809435e2e3` | Merged PR #13 implements authenticated prepare/content/finalize and private R2 verification; uploads remain disabled by default |
| `anflyg/tackwise-contracts` | `88ed864f5b60ec25c085d06851db6cfc32cd5fae` | Upload/raw-v1 contracts; no analysis input/result schemas yet |
| `anflyg/TackWiseAnalysis` | `5fdfc79e33b92e039bdc147188fe662da4de77f2` | README only; no application or API consumer |

The API migrations through 00004 retain the baseline `analysis_runs` statuses `queued | running | complete | error` and a **non-unique** `(race_id, analysis_version)` index. They do not enforce run/race owner agreement or provide dispatch/processing leases. Authenticated owner-only table reads currently include internal object-key columns. These are known implementation gaps to address with reviewed forward migrations, not privileges or schema changed by this ADR.

This decision extends ADR-003's analysis handoff and concretizes its cleanup requirement. Offline-first recording, accepted-race-first finalize, entitlement accounting, the private raw-object boundary and existing owner access after entitlement expiry remain unchanged.

## Decision

### Queue architecture and trusted consumer

Use **Cloudflare Queues for transient, at-least-once delivery**. PostgreSQL remains the durable source of truth for intended work, attempts, leases and outcomes. Queue and dead-letter queue (DLQ) contents are not the durable record and must not be the only recovery mechanism.

```text
accepted race committed in PostgreSQL
    -> durable unique analysis_run
    -> dispatch attempt
    -> Cloudflare Queue
    -> route-less trusted analysis consumer
    -> durable completion or error in PostgreSQL
```

Cloudflare Queues fits the existing Worker/R2 stack and supplies delivery/retry facilities. Database-only polling would require more custom delivery machinery; `waitUntil()` alone would not provide durable recovery. The selected queue still cannot transact with PostgreSQL, so unknown sends and duplicate delivery must always be safe. Reconciliation repairs missing notifications from database state.

Use a **separate route-less Worker/consumer owned by `anflyg/tackwise-api`**. It may hold server-side Supabase credentials, a private R2 binding and a queue consumer binding. It exposes no public browser endpoint. Initial consumer concurrency is **1**, and batch size is **1**; increases require measured CPU, memory and R2 evidence. Actual analysis must fit measured runtime/resource limits before enablement.

The producer and consumer are trusted server code. Receipt of a queue message alone is not authority to read an arbitrary object: the consumer validates the strict envelope, resolves the accepted race and run from PostgreSQL, verifies owner consistency and supported versions, and claims eligible work before reading private R2. It obtains no key or owner from the message.

### Analysis identity and versioning

The initial behavior/result identifier is **`analysis-v1`**. `analysisVersion` identifies stable deterministic analysis behavior and result semantics; it is independent of `rawFormatVersion`, API version and `resultFormatVersion`. Processing timestamps are operational metadata, not algorithm identity. A result-affecting behavior change requires a new analysis version, rather than silently changing historical results under the same identifier.

The queue envelope, `analysis_runs.analysis_version`, stored result and future Analysis API DTO carry the same analysis version. A stored result also records the accepted raw format/digest it consumed and its own result format version. Multiple historical analysis versions may coexist for one immutable race. Never overwrite raw telemetry or historical analysis versions. The optional re-analysis entitlement/product policy remains separate from completing the initial analysis authorized by acceptance.

A forward migration must enforce **`UNIQUE (race_id, analysis_version)`**. Application-only duplicate checks and the current non-unique index are insufficient. Inspect existing duplicate and inconsistent-owner rows before adding constraints; stop for reviewed remediation rather than silently discarding history. `analysis_runs.user_id` must be derived from `races` and database-enforced to agree with its owner.

Plan **`races.required_analysis_version`**. Only the run matching that value may drive `uploaded -> processing -> ready/error`. Historical runs cannot modify current race state. Assignment of a required version is a server-side decision, gated with analysis creation; deployed legacy/null targets require explicit handling in the migration/RPC PR. Deploying a new algorithm must not implicitly retarget all historic races.

Retain and evolve `analysis_runs` rather than redesigning the baseline. Plan durable dispatch and processing attempts, separate lease ownership/expiry, next eligible retry, sanitized terminal errors, processing timestamps and consumed raw identity. Exact columns, constraints, indexes and RPC signatures belong to step 6C. New public-schema Data API objects require explicit least-privilege `GRANT`/`REVOKE` statements in the same migration; do not rely on automatic Supabase grants. Historical migrations remain unchanged.

### Minimal analysis input contract

`anflyg/tackwise-contracts` owns the queue envelope, its strict schema, types, compatibility rules and fixtures. The initial message contains exactly:

```json
{
  "raceId": "8d64f32d-28d9-4df0-b83d-4818d229930f",
  "analysisVersion": "analysis-v1"
}
```

Require a valid race UUID, the supported analysis identifier and **no additional properties**. Never include a user UUID, GPS samples, raw telemetry, raw/result R2 keys, email, Apple identity, entitlement data, tokens or credentials. The trusted consumer resolves all required metadata from PostgreSQL. The envelope is pseudonymous personal data, minimized for this purpose, not anonymous data or product analytics.

### Summary, detailed result and client access

Separate a small client-safe summary from the detailed derived analysis result:

- Store a bounded, schema-validated summary in PostgreSQL. It must not contain GPS sample streams, raw track arrays, internal object keys or arbitrary unbounded JSON.
- If the detailed result is too large for PostgreSQL, store a private immutable R2 artifact. Database metadata must identify its result format version, SHA-256, byte size and server-only object reference. The result contract must define the exact hashed bytes and immutable retry behavior before implementation.

Exact sailing metrics, summary/result schemas, numerical limits and detailed-result key convention remain later contract decisions. This ADR invents no sailing algorithms or metrics. GPS/track content must not be introduced into a client-readable metadata table without a separate privacy review.

Adopt **Worker-only authenticated, owner-scoped APIs for TackWiseAnalysis**. Browser access to Supabase Auth is compatible with this decision; direct Supabase table access is not the long-term browser data API. TackWiseAnalysis never accesses R2 directly. A future DTO exposes safe fields such as `raceId`, `analysisVersion`, `status`, processing timestamps, `summary` and `detailAvailable`. It excludes raw/result object keys, lease state, provider diagnostics and credentials. Every metadata/status/result request independently verifies ownership; UUID/key possession grants no access.

Before Analysis client rollout, a reviewed forward migration must remove/restrict current direct table visibility of internal fields, including `raw_object_key` and `result_object_key`, while preserving authorized owner access through the Worker. RLS remains defense in depth, and service-role operations must explicitly enforce ownership because service role bypasses RLS. This architecture PR changes no grants.

### Durable lifecycle and failure handling

| Stage | Durable behavior |
| --- | --- |
| Accepted / `uploaded` | Finalize commits independently of queue availability. Only committed accepted state is eligible for initial analysis. |
| Ensure run | When enabled, assign/resolve the required version and ensure one `queued` run using database uniqueness. A missed handoff is recoverable. |
| Dispatch | Claim a separate dispatch lease and record an attempt before sending the minimal message. Sending does not mark the run complete. |
| Consumer claim | Claim a processing lease atomically for eligible work, record the processing attempt and move the run to `running`; update the race to `processing` only for its required version. |
| Completion | Verify/persist the immutable result and atomically commit run `complete` plus race `ready` where the required version still matches. |
| Transient failure | Persist a bounded delayed retry. A run may return to `queued`; the accepted race remains immutable. Retry waiting after processing has begun must not falsely advertise `ready`. |
| Permanent failure or exhaustion | Persist terminal run `error`, and race `error` only for the required version; alert for manual intervention. |

All retries operate on the same run identity. A duplicate delivery for completed/terminal work is a no-op; a message for work with a valid processing lease must not start another attempt. A failed, missing or unknown queue send remains recoverable by redispatch. Queue-send success followed by an uncertain database update may also cause safe duplicate delivery.

Completion and retry/error transitions require current lease ownership. An expired or replaced lease cannot commit, and an old worker must not overwrite a result after lease loss. If result storage succeeds but database completion is uncertain, reconcile the stored artifact and repeat the guarded completion idempotently; never blindly overwrite a prior artifact. Exact SQL/RPC and object-write mechanics must prove these properties in the implementation PRs.

### Initial beta operational values

These are approved initial beta values, configurable and reviewable with evidence later. They are architecture requirements, not configuration applied by this PR.

| Setting | Initial value |
| --- | --- |
| Dispatch lease | 5 minutes |
| Processing lease | 20 minutes |
| Maximum dispatch attempts | 6 |
| Maximum processing attempts | 5 |
| Maintenance/reconciliation schedule | `*/15 * * * *` |
| Existing Supabase heartbeat | `0 */4 * * *` — preserve |
| Consumer concurrency / batch size | 1 / 1 |
| Reservation lifetime | 24 hours |
| Earliest abandoned-upload cleanup | `expires_at + 1 hour` |
| Maximum cleanup batch per maintenance invocation | 25 reservations |
| Maximum automatic cleanup attempts | 6 |

Use bounded exponential backoff with jitter. Attempt limits count attempts, including the first, rather than allowing that many additional retries. Persist counters across lease expiry, redispatch and redelivery; queue retries must not multiply an unbounded independent retry budget. Duplicate no-op messages are not new processing attempts. Exact delays, dispatch batch limits and cleanup lease mechanics belong to the implementation PRs and must remain bounded within runtime/cost and retention goals.

No automatic path restarts terminal work indefinitely. Exhaustion produces a durable safe error state plus an operational alert/manual intervention. Queue/DLQ handling cannot erase the database outcome. Provider outages may prevent timely completion; preserve recovery evidence and escalate rather than report success or silently extend retention forever.

### Bounded scheduled reconciliation

Maintenance uses `*/15 * * * *` and processes a bounded amount of work per invocation, with bounded database claims, conceptually `FOR UPDATE SKIP LOCKED`. Never loop until the database is empty. Keep heartbeat scheduling and its existing keepalive behavior independent: adding maintenance must not run the heartbeat every 15 minutes or remove the four-hour trigger/migration 00004.

When analysis is enabled, recover:

1. Accepted `uploaded` races without the required analysis run, including missed initial targeting/handoff under the approved initial version policy.
2. Queued runs with missed/uncertain dispatch once their persisted retry time and dispatch lease permit another attempt.
3. Expired processing leases where retry remains allowed; invalidate stale ownership and respect the same persisted attempt ceiling.

Do not resurrect completed, terminal or deletion-pending work. Concurrent maintenance invocations must claim independently and converge without duplicate durable runs. Missing/expired queue messages never delete or complete the durable work. Record bounded counts, timings, categories and backlog/retention alerts without logging race payloads or identifiers from the envelope.

### Abandoned-upload cleanup and concurrency

Reservations expire after 24 hours. Begin cleanup no earlier than **`expires_at + 1 hour`**, with at most **25 reservations per maintenance invocation** and **6 automatic attempts** per cleanup item. Normal abandoned upload data should be removed within approximately **48 hours after prepare**, preserving ADR-003's further-24-hour cleanup target. The grace window is not an extension of upload/finalize authorization.

Before deleting any raw R2 object, authoritatively verify PostgreSQL accepted-race state, the exact reservation/object identity and current cleanup lease ownership. Never delete an object belonging to an accepted race, regardless of that race's analysis state. A failed/uncertain database check grants no deletion authority.

| Case | Required outcome |
| --- | --- |
| Expired reservation without an object | After authoritative accepted-state/identity/claim checks and safe exclusion of late writes, complete removal of the reservation. |
| Expired reservation with the exact private orphan | Verify no accepted race references it; delete only that exact object under valid cleanup ownership, then finish database cleanup idempotently. |
| Accepted race plus stale matching reservation | Remove the reservation only; retain the accepted raw object. |
| Accepted race/reservation identity mismatch | Preserve objects and durable evidence; raise a safe integrity error for manual investigation. |
| R2 delete outcome or database completion uncertain | Retain durable database cleanup state, recheck later and finish idempotently. Do not discard the only recovery/object reference. |
| Expired content-write lease (`cleanup_content_write_uncertain`) | Durable terminal recovery state for automatic abandoned-upload cleanup. Do not clear the lease, delete the R2 object, remove the reservation, or reactivate the row. Preserve the reservation, exact object reference, and lease evidence for operator/recovery handling in step 6G. |

Claims and accepted-state checks must be concurrency-safe with finalize. A stale read followed by an uncoordinated R2 delete is insufficient. The implementation must prevent acceptance from winning after cleanup has authorized deletion and prevent a stale cleanup worker from deleting an object accepted by a renewed reservation. It must also account for an in-flight content PUT finishing after expiry/cleanup, so late writes cannot leave permanent orphans. A one-hour grace or a database lease alone is not proof of cross-store exclusion. Exact SQL/RPC, lease and upload coordination belong to the implementation PR and require concurrency/failure tests before enablement.

Automatic timing, grace periods, and lease expiry are not proof that an external R2 PUT can no longer complete. Therefore `cleanup_content_write_uncertain` is terminal for automatic abandoned-upload cleanup; only an operator/recovery workflow may resolve it. Step 6G owns the operational evidence and recovery tooling needed to observe unresolved cases and require manual intervention rather than leave storage untracked. Safety takes precedence over meeting the normal cleanup retention target for this exceptional state; report any missed target.

On other cleanup exhaustion, retain minimal actionable recovery state and alert for manual intervention. The finite automatic budget must not turn unresolved personal data into permanent untracked storage. Safety also takes precedence over deleting an accepted object to meet a retention target; report any missed target.

### Operational gates

Preserve `RACE_UPLOADS_ENABLED` and its exact-`"true"` semantics; uploads remain production-disabled by default.

Plan **`ANALYSIS_PROCESSING_ENABLED`**. Only exact `"true"` enables creation/targeting of new analysis work, queue publishing, consumer processing, raw R2 reads for analysis and derived-result writes. Missing, malformed or any other value is disabled. Producers, reconciler and consumer must all enforce the gate; enabling uploads alone does not enable analysis.

A message received while processing is disabled must not read telemetry or process it. Its durable PostgreSQL work remains eligible for later reconciliation after enablement; transport acknowledgement/deferral must not mark the run complete or consume an unbounded retry budget. Gate handling must not lose durable work when transient messages expire.

Allow temporary fail-closed **`RACE_UPLOAD_CLEANUP_ENABLED`** for initial cleanup rollout, also enabled only by exact `"true"`. Cleanup must be operational before production uploads are enabled and must continue independently when uploads or analysis are disabled. These gates are not configured by this PR.

### Security, privacy, deletion and CRA evidence

Race/GPS data, derived results and the minimal queue envelope are personal/pseudonymous data processed only for user-requested storage and analysis. Object keys are server-internal; service-role credentials never reach browser/iPhone clients. Queue producer/consumer permissions and server RPCs must use least privilege, with isolated non-production resources for operational testing.

Analysis/dispatch/reconciliation/cleanup logs contain safe opaque correlation IDs, phases, categories and bounded operational counts/timings/status only. Do not log GPS payloads, user UUIDs, raw/result R2 keys, digests, tokens, credentials or provider response bodies. Do not log the queue envelope. A correlation ID should identify an operation without embedding a race/user identifier. This is a stricter rule for these workflows than older documents' optional user-ID logging; it does not authorize unrelated runtime logging changes in this PR.

Before beta rollout, require a separate retryable cross-store deletion design and demonstrated deletion path covering accepted race rows, `analysis_runs`, raw R2, derived-result R2, reservations/orphans and account deletion. Deletion must be observable, finite in its automatic retries, and safe under partial provider failure. Preserve durable object references before relational deletion; do not use PostgreSQL `ON DELETE CASCADE` as the first step if it destroys the only R2 references. Dispatch/processing must honor deletion state so late messages or consumers cannot recreate deleted personal data. The detailed deletion workflow remains a separate design/implementation task.

Update privacy/processing records and processor/retention configuration before actual collection. Operational evidence required before production enablement includes uniqueness/ownership/RLS/privilege tests, duplicate delivery, unknown sends, expired/stale leases, finite retry/DLQ recovery, result-write/DB uncertainty, cleanup/finalize/late-PUT races, deletion drills, safe logging, private R2 checks and measured Worker CPU/memory/R2 behavior. These add to the existing CRA risk and release evidence; this ADR makes no legal conformity claim.

## Delivery sequence and remaining work

Step **6A** is this architecture ADR. Deliver **6B** analysis input contract, **6C** database lifecycle migration/RPCs, **6D** abandoned-upload cleanup, **6E** queue dispatch/reconciliation, **6F** analysis consumer lifecycle and **6G** operational evidence as separately reviewed PRs with the dependencies in the [roadmap](../race-upload-implementation-roadmap.md).

Then define strict analysis summary/result contracts in `tackwise-contracts`, implement analysis processing and owner-scoped result APIs in `tackwise-api`, and let `TackWiseAnalysis` consume only those stable APIs. Lifecycle infrastructure must not emit fabricated successful analysis results while algorithms/contracts are still absent. Detailed metrics, result schemas/limits, exact object publication mechanics, deletion implementation and optional re-analysis policy remain later work.

## Consequences

- Cloudflare Queues adds a delivery dependency; PostgreSQL preserves recoverability across queue loss, duplication and provider failures.
- A separate trusted consumer and finite attempt budgets bound the analysis workload and its credential exposure.
- Forward schema/privilege changes are required before dispatch and Analysis client rollout; accepted architecture is not evidence that those changes are deployed.
- Cleanup maintains the existing retention target while requiring proof that accepted objects and concurrent uploads are protected.
- This PR contains documentation only: no runtime code, migrations, bindings, production configuration, algorithms or deployment.
