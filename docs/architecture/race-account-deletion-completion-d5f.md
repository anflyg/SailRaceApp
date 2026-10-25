# D5f — Race/account deletion completion design

**Status: PROPOSED — design only.** ADR-006 is accepted; ADR-007 remains **PROPOSED — NOT ACCEPTED**. The amendments and retention values below require separate approval. This document supplies no implementation, migration, activation, deployment, merge, or completion attestation.

## Inputs and decision boundary

Reviewed on 25 October 2026:

- [AGENTS.md](../../AGENTS.md), [Analysis product](../product/tackwise-analysis.md), [privacy design](../privacy/privacy-design.md), [data inventory](../privacy/data-inventory.md), [processing record](../privacy/gdpr-processing-record.md), [retention policy](../privacy/retention-policy.md), [threat model](../security/threat-model.md), and [CRA risk assessment](../security/cra-risk-assessment.md).
- [Accepted ADR-006](decisions/adr-006-cross-store-race-and-account-deletion.md) and [proposed ADR-007 on main](decisions/adr-007-deletion-resurrection-fencing.md).
- [SailRaceApp PR #14 at 893074da](https://github.com/anflyg/SailRaceApp/pull/14): the explicitly owner-approved server-issued cloud UUID/24-hour creation-intent and account-gate refinements, and the limited ADR-005 guard/payload/seal exception. These inputs do not accept the rest of ADR-007 or merge that PR.
- [API PR #49 at d07f5254](https://github.com/anflyg/tackwise-api/pull/49), its [D5e protocol](https://github.com/anflyg/tackwise-api/blob/d07f525424e6d8476596f84efc0adecf4c12f9d6/docs/result-deletion-fencing-d5e.md), result deletion adapter, migration 00029 and tests. D5e covers a registered result object, preserves D5d raw behavior and retains its source/evidence dependencies. Its local tests are not real-provider or D6 evidence.

| Decision class | What can be designed/implemented within that boundary | Further approval/evidence required |
| --- | --- | --- |
| Accepted ADR-006 | Close access; enumerate owned accepted, pending, orphan and historical-result data; preserve exact references; resolve object outcomes; remove relational data in dependency order; remove Auth after ownership dependencies; escalate bounded retry exhaustion. | Each implementation still needs current authority, non-resurrection proof and D6. Acceptance of the ADR is not activation approval. |
| Limited owner decisions recorded in PR #14 | Original-guard conditional result publication/sealing; separate local/cloud IDs; server UUIDv4 issuance, 24-hour intent validity, missing gates closed, no reopening and a new Auth UUID after full deletion. | Preserve their exact scope. No permanent UUID denylist, account-incarnation identifier, generic marker bypass or implicit acceptance of ADR-007. |
| New D5f architecture proposals | Independent settlement receipts, controlled evidence destruction, an independently recoverable deletion register and restore interlock. | Explicit ADR-007/architecture approval and implementation/provider proof. |
| Privacy/product proposals | Finite periods, completion wording, backup handling, Auth/re-registration and any Apple-token handling. | Owner and privacy review of necessity, lawful basis, processor terms, exact periods and notices. No lawful-retention exception is created here. |

Current 00029 is deliberately stricter than generic absence reconciliation: it admits one lifetime DELETE, permits no replacement after response loss, and resolves only a known applied DELETE followed by exact-key absence. An empty inventory, expired lease, absent object or successful preflight is never a completion capability.

## Scope, stages and completion claim

The deletion unit includes all raw/result versions, reservations, orphan ownership/tombstones, preparations, operation journals, gates, structured summaries, profiles/entitlements as applicable, Auth state, relevant exports/caches and recoverable backup copies. Enumerate from trusted ownership evidence; never infer ownership from an R2 key or an unlinked legacy row. Local iPhone recordings and copies already downloaded by a person are outside cloud erasure; communicate that scope without claiming they were remotely erased.

The names below are conceptual milestones, not a new database schema.

| Milestone | Required fact | Remaining restriction |
| --- | --- | --- |
| Access closed | Current owner request durably closes the race/account gate under approved locks. | Data remains personal and deletion is pending. Already delivered bytes cannot be recalled. |
| Objects resolved | Every durable raw/result identity has verified deletion/absence under its reviewed protocol; no capable initial/legacy writer remains. | Source and journal rows remain until dependent recovery is safe. |
| Live relational data erased | Final locked transaction revalidates inventory and receipts, then removes eligible source rows in reviewed FK order. | Protective records and backups may remain; this is not final deletion. |
| Auth removed, account only | Exact Supabase project/user hard removal and associated identity/session handling are verified after race dependencies. | Old access JWTs and re-provisioning/restore still require protection. |
| Protection/backup expiry pending | Only justified minimal safeguards and inaccessible backup copies remain. | Display pending status, categories and expected deadline; do not report complete. |
| Completed | All covered personal data and reversible copies, including safeguards, are removed, or a separately approved applicable exception identifies exact retained categories, basis and expiry. | No silent exception, indefinite denylist or completion on operator opinion. |
| Recovery blocked, at any stage | Identity, provider finality, Auth, inventory, backup or GC proof is missing. | Gates stay closed, references retained, finite automatic attempts stop, operator/privacy escalation follows. |

A successful read before closure may finish delivering bytes. Subsequent reads and all new upload/analysis/publication admissions must check the appropriate account/race gates. Do not use logout or a previously issued JWT as deletion authority.

## Race completion protocol

1. In the request transaction, acquire **account gate → race gate → lifecycle locks**, validate owner and close the race gate. The account may remain open for single-race deletion. Recheck time/lease after lock waits; record the deletion scope before external work.
2. Under that closed scope, build and reconcile a durable ownership inventory covering accepted and unaccepted raw objects, every registered result/run/version, partial preparations and orphan records. Include known operations whose SQL completion failed. Compare source rows, object registry and recovery ownership evidence; missing evidence or unknown legacy ownership blocks completion. Queue/DLQ draining or bucket listing alone cannot prove completeness.
3. Resolve raw through D5d and registered results through D5e. Preserve original G, immutable payload identity and original response journals. Verify exact registered seal bytes, content type, no encoding and strong ETag before the journaled one-shot DELETE. Confirm known applied DELETE and subsequent exact private bucket/key absence under a current claim. New design receipts below cannot be consumed by current 00029 until separately reviewed implementation exists.
4. Before pruning any source/evidence, commit the necessary minimal closure information to the proposed independent restore register and verify its durable acknowledgement. An unavailable register blocks pruning, not the initial gate closure. Keep full recovery references while any outcome needs them.
5. In a final SQL transaction, reacquire the approved locks and re-read current authority, full inventory, receipts, unresolved work and retention dependencies. Remove/close analysis and upload source rows only when their exact objects and recovery dependencies are resolved. Current FK RESTRICT/evidence guards require a dedicated reviewed cleanup path; do not disable triggers, cascade blindly, or grant general service-role erasure rights.
6. Keep the closed gate, consumed-intent binding and necessary tombstones until the safe-removal predicate below holds. A stale callback after cleanup must fail on missing evidence, never UPSERT a journal, source row or gate.
7. Record the live-erasure milestone, expire backup/protection copies by the approved schedule, verify final erasure, and only then permit final completion. A lost SQL response reconciles the same milestone and identity; it creates no provider authority.

```mermaid
sequenceDiagram
    participant D as Trusted deletion worker
    participant SQL as PostgreSQL authority
    participant R2 as Exact private R2 key
    participant R as Proposed restore register
    D->>SQL: Close race and inventory under account → race → lifecycle locks
    D->>SQL: Claim current object; journal conditional seal
    D->>R2: Seal verified G or P with original registered identity
    D->>R2: Verify full seal and ETag
    D->>SQL: Journal lifetime DELETE; only first admission grants dispatch
    D->>R2: Dispatch that DELETE once
    alt known applied response
        D->>SQL: Preserve response evidence
        D->>R2: Read exact key after DELETE
        D->>SQL: Confirm absence with current claim
    else response lost or outcome unknown
        D->>SQL: Preserve uncertainty and reference; no replacement DELETE
        Note over D,R2: Independent settlement policy required; no completion
    end
    D->>R: Persist closure before eligible source pruning
    D->>SQL: Revalidate all receipts/dependencies; prune eligible rows
    Note over SQL,R: Final completion waits for safe GC and backup expiry
```

## Unknown R2 outcomes: evidence and limits

Cloudflare documents atomic commit-time conditional PUTs and strongly consistent bucket reads. It also explicitly states that a negative read does not wait for or cancel an earlier unknown write. Its suggested generic retry technique does not authorize a new initial guard in this one-shot deletion protocol. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/), [conditional S3 operations](https://developers.cloudflare.com/r2/api/s3/extensions/).

A settlement must answer two separate questions: **what effect committed**, and **which executions can still affect this exact identity**. A strong GET answers present state, not both questions. An ETag is an object-state identifier, not a request-finality certificate.

### Candidate independent evidence contract — proposed

A trusted verifier could admit a provider-origin terminal receipt, or an independently preserved authenticated original provider response, only if it binds:

- provider account, bucket, exact key and operation kind to the already journaled local operation and original authority;
- the provider request/execution identity, actual terminal outcome and commit ordering;
- original PUT condition and expected marker/artifact identity, or the unique admitted DELETE and its verified seal;
- every possible dispatched execution, including SDK/transport retries, with proof no unaccounted execution can still commit;
- evidence provenance, integrity, capture time and bounded verifier version; a second approval verifies scope and provenance, not the operator's belief.

A receipt repository/proxy is a new trust/retention surface. Before/after proxy logs reduce response-loss cases but leave a crash gap unless the provider can close it. Request IDs may themselves be unavailable after response loss. Do not claim a new proxy, operation UUID, credential revocation or Worker termination cancels a provider request already accepted.

Original journals remain immutable. A separately permissioned, append-only settlement records the independent evidence, verification decision and current authority; it never changes an original uncertain response to applied. Provider bodies/keys stay in restricted recovery evidence only while necessary, never ordinary logs. Current API #49 has no such receipt/settlement path.

| Original uncertainty | Evidence that could permit progress without redispatch | What remains blocked |
| --- | --- | --- |
| Initial guard unknown; provider proves the exact creation applied and is terminal | Correlated authenticated terminal record plus positive exact guard/registered-state verification, exhaustive execution/writer coverage and current closed-gate authority. | A positive guard GET alone cannot satisfy D5e's known-applied initial guard requirement. New settlement semantics require approval. Never create a replacement guard. |
| Initial guard conclusively never applied and no execution remains capable | Provider/executor evidence with complete scope and finality plus exact-key absence and no other writer. | Classifying “never materialized” would be a new terminal predicate, not current D5e deleted. Without approval keep unresolved; absence/no log entry alone is insufficient. |
| Payload or seal response unknown | Exact positive registered state may be observed under existing reviewed rules. A stale conditional G/P write may be proven permanently incapable after a verified seal/deletion; its response uncertainty need not be falsified. | No new G, changed payload, changed condition or overwritten response journal. Unknown initial guard and legacy writers remain separate blockers. |
| Lifetime DELETE unknown; provider proves that exact execution applied and is terminal | Correlated authenticated applied receipt, no other pending dispatch, then a fresh exact-key absence read and current SQL verification. | Append settlement evidence only through a newly reviewed path. Do not dispatch another DELETE. |
| DELETE proved not applied, seal still present | This settles the historical outcome but does not erase the seal. | No completion and no replacement DELETE under D5e. A future idempotent provider operation or distinct recovery protocol would require explicit architecture review; none is proposed as an available workaround here. |
| DELETE remains unknown but key is absent | Absence is a useful observation only. | Current applied-DELETE predicate is unsatisfied. “Fenced stable absence,” external destruction or namespace retirement would need a separately proved/approved terminal rule, not a relabelled success. |
| Legacy/unconditional writer may exist | Exhaustive writer/credential inventory plus authoritative evidence that all earlier accepted executions are terminal, followed by exact-object reconciliation. | Rotation, deployment shutdown, timeout, grace or list/HEAD does not by itself prove a submitted write stopped. |

### Available provider evidence is not yet sufficient

R2 **Data Access Logs** document successful supported object operations, but delivery is asynchronous/best effort, records may be omitted, failures at HTTP 400+ are excluded, and logging is not retroactive. The published fields do not establish a universally available exact-operation/condition/ETag finality receipt. A positive record is a candidate corroborating fact, not automatic admission; a missing record proves nothing. Configuration audit logs do not log object mutations. [Data Access Logs](https://developers.cloudflare.com/r2/buckets/data-access-logs/), [R2 audit logs](https://developers.cloudflare.com/r2/platform/audit-logs/).

R2 object notifications identify action/key/time, but delete events omit ETag; they do not establish that the event is this admitted DELETE or that no request remains in flight. [Notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/). Provider support might supply a stronger scoped terminal attestation; its availability, semantics and integrity must be verified, not assumed. No public finality lookup sufficient for this protocol was established in this review. Enabling object logs is itself a separate privacy, region, retention and cost decision because they can collect keys, actor identifiers and network metadata; this design enables none.

**Consequence:** a guaranteed finite completion path for arbitrary unknown guards/DELETEs is not demonstrated. D5f must not promise one. Keep affected cases unresolved and escalate; a deadline is not permission to discard the last recovery reference or call retained personal data deleted.

## Account completion and Supabase Auth removal

1. Close the account gate in the account-request transaction before later locks. Freeze new admissions, enumerate all ownership units, and process child races in bounded durable batches. Re-enumerate under the closed account at the final barrier; a cached page count is insufficient.
2. Require every child live object/source dependency resolved, including reservations/orphans and historical results, before Auth becomes eligible. Child backup/protection records may remain only if an approved FK-independent register now owns their recovery/expiry responsibility; account final completion still waits for them.
3. Reconcile profiles, entitlements, beta-administration audit and other account rows against an explicit deletion/exception manifest. No broad cascade may erase the only ownership mapping. A billing/audit purpose cannot retain unrelated race data.
4. Resolve Apple-token/re-provisioning policy before enabling this stage. Journal the exact Supabase project and user UUID before a trusted admin hard-delete request. Soft deletion retains a hashed identifier and is not the proposed terminal state. Never delete/reassign unrelated Supabase Storage data merely to bypass an Auth error; unexpected Storage ownership blocks reconciliation.
5. Preserve Auth response uncertainty separately. A timeout triggers read-only reconciliation of the exact user, identities and relevant sessions through a supported privileged verification path. No endpoint, verification RPC or universal Auth retry guarantee is assumed here. A present user remains pending; a 404 from the wrong project or unavailable query is not proof. Any repeat requires a documented/proved exact-identity-safe operation and fresh authority, never a list/name/email match.
6. Verify removal of the user and associated in-scope identity/session/refresh state, current closed/missing gate enforcement, and no stale Auth response or retry capable of reactivating it. Keep the minimal recovery capsule outside Auth cascades until verified. Final account GC then follows the same backup/protection predicates as race GC.

Supabase documents that hard user deletion removes its user/session state and refresh capability, while already issued access JWTs remain valid until expiry. Its admin API defaults to hard deletion; soft deletion keeps a hashed user identity. These facts do not replace per-request TackWise gate enforcement. [User deletion](https://supabase.com/docs/guides/auth/managing-user-data), [admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

**Auth decision still open:** verify fresh registration yields a distinct Supabase UUID and cannot restore prior race ownership. Also test delayed Apple sign-in/exchange and client auto-retry around Auth removal: a different UUID alone does not prove a deliberately requested new registration. App gates do not automatically fence Supabase's public Auth provisioning surface. If the existing new-user trigger could provision an unintended new open account, a fresh-intent/provisioning control or temporary replay barrier needs explicit architecture/privacy approval. No permanent Apple-subject denylist or extra account-incarnation component is selected.

Apple documents token revocation for account deletion and a manual-revocation route when no usable token/code exists. Choose the applicable provider-supported route without making user data erasure depend on obtaining new credentials. [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple). Storing Apple access/refresh tokens, adding a revocation service, retention or a new identity link would change current minimization/security assumptions and requires separate review; this design does not authorize that collection or configuration.

## Finite retention and safe evidence destruction

### Safe-removal predicate

Remove a particular gate/tombstone/journal only after a current guarded transaction proves all applicable conditions:

- Trusted ownership inventory is complete; all required objects are resolved; no unknown initial guard, unresolved lifetime DELETE or capable legacy write remains.
- Delayed conditional payload/seal requests are either terminal or permanently unable to satisfy their original condition. No admission path can reacquire G or create a missing gate from stale input.
- All creation-intent attestations capable of affecting this identity are expired/rejected under trusted server time, and consumed-intent bindings remain protective until then. The approved lifetime is 24 hours, including tokens whose temporary rows were pruned. Do not add an expiry grace or auto-renewal. A creation transaction rechecks validity and closure after lock waits.
- Missing gates fail closed in every ordinary/direct privileged admission path. Only the dedicated reviewed fresh-creation path can provision a new identity. For accounts, verified Auth removal and non-reactivation/re-registration safeguards also hold.
- No FK, recovery, delayed outcome callback or restore dependency needs the record; missing evidence cannot be recreated by an UPSERT.
- The independent register and backup manifests cover every still-recoverable copy. Its durable acknowledgement precedes pruning. If the account remains open after one race is removed, fresh intent may create a different race; it cannot reopen the old identity.
- The narrowly authorized cleanup transaction removes dependencies in reviewed order and serializes against current claims and outcome recorders. Integrity guards are not bypassed administratively.

The approved UUIDv4 collision probability remains the identity risk decision. This proposal adds no global UUID denylist or permanent pseudonymous protection row.

### Candidate schedule for owner/privacy approval

These are concrete review values, **not current policy or a legal-retention exception**. The existing account target is 30 days; applying that target to races is a new product proposal. Let T_live be the verified erasure time of in-scope live content/Auth, excluding the minimal safeguards still required below.

| Category | Proposed bound and trigger | Failure at bound |
| --- | --- | --- |
| Race/account operational completion | Target 30 days from request. To meet it with the backup window below, live erasure normally needs to finish at least 8 days earlier. | Report pending and escalate before the target; never fabricate completion. |
| Full object/source/response evidence and exact references | Remove within 24 hours after the safe-removal predicate and all evidence dependencies are satisfied; never expiry-delete unresolved evidence. | Minimize nonessential fields, preserve necessary recovery state and escalate its continued necessity. No automatic indefinite-retention approval. |
| Gates, consumed intents and tombstones | Remove within 24 hours of their safe-removal predicate, including the actual last valid 24-hour attestation expiry. | Keep the protection, deletion pending; resolve the failed predicate. |
| Recoverable content backups, WAL/PITR, replicas and exports | Proposed maximum recoverable age: 7 days from creation; copies cannot refresh that age. Verify the effective provider/operational policy for every copy. | Stop claiming a bounded restore horizon; owner/privacy review must resolve capability or approve a different explicit schedule. |
| Independent minimal deletion register and restore manifests | Keep closure coverage until all older recoverable content copies expire; erase its identity-bearing records and all their copies within the following 24 hours (normally no later than T_live + 8 days). | No final completion. Register backups must not create a fresh rolling retention cycle. |
| Audit, support cases, logs and receipts | Remove/minimize identity-bearing data with its documented necessity; completion requires their erasure unless an applicable scoped exception is approved. Retain only demonstrably non-identifying aggregate evidence afterward. | A hash, random identifier or detached key is not automatically anonymous. Review each remaining category. |

An independent register must support expiry of all record/cohort copies at the approved deadline; repeatedly copying it into rolling general-purpose database backups would defeat this schedule. Provider-retained residuals, manual downloads, test restores and support exports count in the inventory. The proposed 7-day cap is not a statement that the current plan provides or can configure that guarantee. Supabase's published backup options vary by plan; database backups do not include Storage API object contents, and they do not cover external R2. Verify the actual project, Auth/database coverage and any separate object-copy policy. [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Unknown provider finality creates a real tension between retained recovery data and finite erasure. It cannot be solved by a TTL. At exhaustion/deadline, the controller/owner must decide an enforceable technical resolution or a separately justified applicable retention exception with scope/review/expiry; an operator cannot declare one. Record the unresolved risk and avoid rollout promising a completion guarantee that cannot be met.

## Coordinated backup and restore — proposed architecture

The candidate is a minimal encrypted deletion register **outside the rollback domain of the workload backup**. It records closure scope/opaque ownership, monotonic ordering/watermarks and expiry; exact keys are retained only in the restricted recovery capsule while needed. Backup object manifests retain authoritative ownership associations for their own lifetime. No provider, storage product, encryption/key scheme or new personal-data collection is selected.

A SQL close may precede register delivery, but no source pruning/Auth removal may rely on an unacknowledged register event. The acknowledgement records a durable coverage watermark. “Latest” must be provable against the closed source/backup cut; a reachable but stale register is insufficient.

| Restore step | Required interlock/evidence |
| --- | --- |
| Freeze | Quarantine the restored environment: no user reads, Auth provisioning, timers/queues, provider mutations or old credentials automatically enabled. Restore is a separately authorized operation. |
| Establish cut | Inventory database/Auth snapshots, WAL, R2 copies, queues, replicas, exports, manifests and key/attestation policy versions. These stores are not an atomic snapshot. Obtain the newest verified deletion register through the required coverage watermark. Missing/gapped/rolled-back register blocks opening. |
| Apply current rules | Use current reviewed schema/code/privileges and key-revocation state. Overlay every race/account closure and erasure after the snapshot cut before ordinary access. Never restore an old open gate, deleted Auth identity or retired attestation verification key by implication. |
| Select data | Exclude deleted identities and their owned rows/objects from restoration. Reconcile object manifests with SQL ownership; unknown mappings stay quarantined. Do not restore erased payloads merely to run old deletion jobs. |
| Reconcile | Treat restored pending mutations/claims and old Queue messages as historical evidence, not dispatch authority. Re-read exact current provider state under current claims. Do not replay a guard, seal, lifetime DELETE or Auth request from a backup journal. |
| Verify | Prove closed/missing gates reject old JWTs, intents and direct SQL paths; no Auth trigger recreates deleted accounts; no result/raw payload reappears. Resolve mismatched R2/SQL snapshots and outstanding evidence before reopening unaffected scopes. |
| Release and expire | Release only independently verified unaffected scopes. Destroy quarantine/export copies and expired register/manifests under the same finite policy; retain minimized drill outcomes. |

If deleted personal data is accidentally restored or a provider operation is accidentally replayed, contain it and treat it as a recovery/security/privacy incident. Do not reset an old operation to pending or grant a replacement DELETE to hide the breach; remediation needs a separately reviewed current operation/identity protocol. No restore process may silently discard an unresolved case.

## Failure and recovery cases

| Failure/ordering | Required outcome |
| --- | --- |
| Payload-before-seal / seal-before-payload | Reproduce D5d/D5e's original-condition proof; late G payload cannot recreate content after seal deletion. |
| Duplicate requests, claims or SQL response loss | Resume same durable unit; no second lifetime DELETE, fresh guard or reopened gate. |
| Crash after DELETE admission, before known dispatch | Preserve pending uncertainty. No-log/no-response is not proof of no dispatch. |
| Applied DELETE, lost response, later absence | Independent applied settlement required; otherwise unresolved under current D5e. |
| Final proof of failed DELETE, seal remains | Historical uncertainty resolved but erasure incomplete; replacement dispatch remains prohibited. |
| Exhausted lease/attempt budget | Durable recovery state and escalation; rechecks cannot mint new mutation authority. |
| Missing/corrupt seal, wrong bucket/key/source or legacy ownership | No DELETE/completion; retain exact trusted references and reconcile conflict. |
| New detail read/completion concurrent with close | Serialize admission under approved locks; closed/missing gates deny later work. Prior delivery cannot be recalled. |
| Partial relational pruning or FK conflict | Transaction rolls back or resumes known milestone; retained registry/register still covers all remaining references. |
| Auth response lost, stale JWT, delayed Apple exchange | Exact-project read-only reconciliation and gate enforcement; test provisioning replay and distinct new UUID. No name/email match or assumed token revocation. |
| Backup/ledger outage or stale watermark | No dependent pruning or restore opening; do not overwrite newer closures with older snapshots. |
| TTL reached while provider outcome unknown | No evidence drop, final completion or inferred lawful exception; owner/privacy escalation. |
| Direct privileged DML or cleanup races with recorder | Fixed executor permissions/guards and account → race → lifecycle order reject bypass; no disabled triggers or arbitrary force-complete. |
| GC followed by old valid intent, callback or queue | Predicate must have prevented it; reject without recreating gate, journal or source rows. |
| Restore of an older Auth/open-gate snapshot | Apply independent closure coverage before access; if coverage cannot be established remain quarantined. |

## Exact proposed amendments — supplied for review, not applied

Each block is additive proposed wording. Acceptance is separate from approving this design PR. ADR-007's status stays PROPOSED until its explicit decision.

### ADR-006: add “Completion, residual protection and restore”

> Access closure, object resolution, live-data erasure, Auth removal and final deletion completion are distinct milestones. Retained identity-bearing protective records and recoverable backups remain personal data. They keep deletion pending unless a separately approved applicable retention exception specifies retained categories, purpose/basis, access, review and expiry. Automatic retry exhaustion, a target date or operator review is not completion.
>
> Auth removal follows resolution of all live race/object and ownership dependencies. Any remaining backup/protection responsibility must have a verified FK-independent owner before Auth cascades occur. Verify hard Auth removal, session/refresh handling and non-reactivation; already issued JWTs must not bypass closed or missing TackWise gates.
>
> A final completion decision requires current guarded revalidation of the full owned inventory, terminal object evidence, safe removal of gates/tombstones/recovery records and expiry or erasure of recoverable copies. Restore must apply independently preserved deletion closures before user access or mutation. No retention period, lawful exception, new register provider or activation is approved by this amendment alone.

### ADR-007: add “Uncertainty settlement and finite safeguard removal”

> Initial guard creation and the lifetime object DELETE are never redispatched to resolve an unknown outcome. Admission/response journals remain immutable. A separately authorized append-only settlement may reference authenticated independent provider/executor evidence that binds the exact registered operation and proves its terminal effect and the absence of any still-capable execution. Negative reads, absent logs, lease expiry, credential rotation and elapsed time are insufficient.
>
> An applied DELETE settlement additionally requires subsequent exact-key absence under a current deletion claim. A definitely unapplied DELETE with a remaining seal is unresolved erasure and grants no replacement dispatch. Never-materialized or externally-erased terminal predicates require their own approved proof; they are not inferred from this protocol.
>
> Safeguard removal requires exhaustive ownership/object resolution, permanent incapability of stale conditional mutations, expiry of all relevant 24-hour creation intents, missing-gate denial on every path, verified Auth lifecycle where applicable, and independently recoverable restore closure coverage. Cleanup cannot recreate missing evidence or reopen identity. Explicit finite retention and restore controls require approval and D6; unresolved initial/legacy mutations prevent completion.

### ADR-005: add to the conditional publication/deletion boundary

> Immutability protects result payload identity and original operation evidence while they exist; it does not approve indefinite evidence retention. A separately reviewed, narrowly authorized deletion-completion path may destroy preparations, journals and source references only after no recovery dependency remains, exact object erasure is proved, and approved replay/restore safeguards preserve closure. It must serialize with outcome recording, respect dependency order and prevent missing-row recreation. This is evidence destruction, not payload overwrite, journal rewriting or a new R2 mutation authority.

### Retention policy: proposed schedule amendment

> Subject to owner/privacy approval and verified provider capability, use the D5f candidate schedule: a 30-day operational target for race/account deletion, a maximum 7-day recoverable content-backup age without TTL renewal by copying, cleanup within 24 hours of each safe-removal predicate, and destruction of the independent identity-bearing restore register and all its copies within 24 hours after the last older content copy expires. Unresolved cases remain pending and receive explicit escalation; these values create no lawful-retention exception. Publish an accurate scope and period only after provider evidence and the coordinated restore drill demonstrate them.

## Acceptance criteria and remaining decisions

A later implementation/D6 review must demonstrate:

1. Complete owned inventory across accepted/pending/orphan/historical states; cross-owner, legacy NULL-owner and empty-registry negative cases; retained source identity across raw/result composition.
2. Local PostgreSQL multi-session barriers for approved lock order, expiry after waits, source pruning, outcome recording, gate GC and direct privileged bypass; no premature terminal transition.
3. Injected conditional-commit tests plus isolated provider evidence for payload/seal orderings, original-G delays, exact seal bytes/type/ETag, unknown guards/DELETEs and duplicates. Offline tests alone do not satisfy this criterion.
4. Forged, unrelated, stale, incomplete and conflicting settlement receipt rejection; original journals unchanged; negative log/read cases unresolved; no redispatch after any uncertain admission.
5. Crash recovery at each register/SQL/provider boundary, including lost durable acknowledgements and reconciliation after attempt exhaustion.
6. Supported Supabase hard-delete/identity/session proof, cascade inventory, outstanding JWT rejection and isolated Apple/Auth delayed-exchange/re-registration evidence. No real user/credential experiment is authorized by this document.
7. Trusted-clock/intent-expiry and consumed-intent tests across pruning and restore; no implicit renewal, gate opening or UUID reuse from stale input.
8. Seven-day candidate retention capability verified for every provider/copy, including WAL, manifests and register replicas; no rolling backup of identity safeguards extends the deadline.
9. Quarantined coordinated restore drills with newer R2/older SQL, newer SQL/older Auth, missing register watermark, old keys and old messages. Deleted data/identities never become readable or writable.
10. Minimal logs, restricted evidence access, documented operator escalation and privacy inventory/processing/retention/threat/CRA updates before enablement. User status accurately distinguishes pending, retained categories and completed erasure.
11. Separate reviewed implementations and explicit rollout authorization. All existing flags stay disabled; existing delivery branches and M1–M7 work continue independently.

| Owner decision | Proposed direction | Blocking uncertainty |
| --- | --- | --- |
| O1 — R2 settlement | Keep the strict no-redispatch rule and require independently authenticated terminal evidence. | No sufficient generally available finality/receipt mechanism has been demonstrated; some cases may remain unresolved. |
| O2 — Finite periods and completion wording | Review the 30-day target, 7-day backup cap and 24-hour safe-cleanup deadlines; final completion waits for residual safeguards/copies. | Provider retention/copy inventory, operational feasibility and privacy necessity must support the values. |
| O3 — Auth and Apple lifecycle | Hard Supabase removal after dependencies; fresh explicit registration with a distinct UUID; choose the supported Apple revocation route. | Provider replay/provisioning behavior and any required token/subject retention or new-user-trigger constraint need explicit architecture/privacy approval. |
| O4 — Restore architecture | Approve or replace the independent deletion register, coverage watermark and quarantined restore interlock. | Storage/trust model, availability, access, keys, finite copy expiry and cost are unselected. |
| O5 — ADR changes and release evidence | Review the exact amendments above independently; preserve the bounded existing approvals. | ADR-007 remains proposed. No amendment text, local test result or design acceptance replaces real-provider/D6 evidence or authorizes activation. |

The focused design is reviewable now. Safe final race/account completion remains blocked on the relevant decisions and proofs above; this document makes no completed-deletion or legal-conformity claim.
