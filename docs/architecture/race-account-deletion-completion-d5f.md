# D5f — Race/account deletion completion design

**Status: PROPOSED — design only.** ADR-006 is accepted; ADR-007 remains **PROPOSED — NOT ACCEPTED**. The amendments and retention values below require separate approval. This document supplies no implementation, migration, activation, deployment, merge, or completion attestation.

## Inputs and decision boundary

Reviewed on 25 October 2026, including PR #19's review and the follow-up hypothesis in its latest owner comment:

- [AGENTS.md](../../AGENTS.md), [Analysis product](../product/tackwise-analysis.md), [privacy design](../privacy/privacy-design.md), [data inventory](../privacy/data-inventory.md), [processing record](../privacy/gdpr-processing-record.md), [retention policy](../privacy/retention-policy.md), [threat model](../security/threat-model.md), and [CRA risk assessment](../security/cra-risk-assessment.md).
- [Accepted ADR-005](decisions/adr-005-analysis-result-v1-identity-and-storage.md), [accepted ADR-006](decisions/adr-006-cross-store-race-and-account-deletion.md) and [proposed ADR-007 on main](decisions/adr-007-deletion-resurrection-fencing.md).
- [SailRaceApp PR #14 at 893074da](https://github.com/anflyg/SailRaceApp/pull/14): the explicitly owner-approved server-issued cloud UUID/24-hour creation-intent and account-gate refinements, and the limited ADR-005 guard/payload/seal exception. These inputs do not accept the rest of ADR-007 or merge that PR.
- [API PR #49 at d07f5254](https://github.com/anflyg/tackwise-api/pull/49), its [D5e protocol](https://github.com/anflyg/tackwise-api/blob/d07f525424e6d8476596f84efc0adecf4c12f9d6/docs/result-deletion-fencing-d5e.md), result deletion adapter, migration 00029 and tests. D5e covers a registered result object, preserves D5d raw behavior and retains its source/evidence dependencies. Its local tests are not real-provider or D6 evidence.

| Decision class | What can be designed/implemented within that boundary | Further approval/evidence required |
| --- | --- | --- |
| Accepted ADR-006 | Close access; enumerate owned accepted, pending, orphan and historical-result data; preserve exact references; resolve object outcomes; remove relational data in dependency order; remove Auth after ownership dependencies; escalate bounded retry exhaustion. | Each implementation still needs current authority, non-resurrection proof and D6. Acceptance of the ADR is not activation approval. |
| Limited owner decisions recorded in PR #14 | Original-guard conditional result publication/sealing; separate local/cloud IDs; server UUIDv4 issuance, 24-hour intent validity, missing gates closed, no reopening and a new Auth UUID after full deletion. | Preserve their exact scope. No permanent UUID denylist, account-incarnation identifier, generic marker bypass or implicit acceptance of ADR-007. |
| New D5f architecture proposals | Option B's authorized repeat DELETE / sealed stable-absence predicate, Option A's independent settlement receipts, controlled evidence destruction, an independently recoverable deletion register and restore interlock. | Explicit ADR-007/architecture approval and implementation/provider proof. |
| Privacy/product proposals | Finite periods, completion wording, backup handling, Auth/re-registration and any Apple-token handling. | Owner and privacy review of necessity, lawful basis, processor terms, exact periods and notices. No lawful-retention exception is created here. |

Current 00029 is deliberately stricter than generic absence reconciliation: it admits one lifetime DELETE, permits no replacement after response loss, and resolves only a known applied DELETE followed by exact-key absence. An empty inventory, expired lease, absent object or successful preflight is never a completion capability.

**Follow-up conclusion:** a permanent one-shot DELETE restriction is not required for live-object safety *if* the formal post-seal invariants below hold forever. Recommend Option B for that eligible subset, subject to explicit approval, implementation and provider evidence. A late DELETE then only removes an already condemned seal or acts on an empty, never-reused key. This is a logical result under stated premises, not evidence that the current system satisfies them. Unknown initial guards and capable legacy writers remain blocked. No safe, universally terminating design for all cases has been established.

## Scope, stages and completion claim

The deletion unit includes all raw/result versions, reservations, orphan ownership/tombstones, preparations, operation journals, gates, structured summaries, profiles/entitlements as applicable, Auth state, relevant exports/caches and recoverable backup copies. Enumerate from trusted ownership evidence; never infer ownership from an R2 key or an unlinked legacy row. Local iPhone recordings and copies already downloaded by a person are outside cloud erasure; communicate that scope without claiming they were remotely erased.

The names below are conceptual milestones, not a new database schema.

| Milestone | Required fact | Remaining restriction |
| --- | --- | --- |
| Access closed | Current owner request durably closes the race/account gate under approved locks. | Data remains personal and deletion is pending. Already delivered bytes cannot be recalled. |
| Objects resolved | Every durable raw/result identity has verified deletion/absence under its approved predicate: current A or, after approval, B's sealed stable absence; no capable initial/legacy writer remains. | Source and journal rows remain until dependent recovery is safe. |
| Live relational data erased | Final locked transaction revalidates inventory and resolution proofs, then removes eligible source rows in reviewed FK order. | Protective records and backups may remain; this is not final deletion. |
| Auth removed, account only | Exact Supabase project/user hard removal and associated identity/session handling are verified after race dependencies. | Old access JWTs and re-provisioning/restore still require protection. |
| Protection/backup expiry pending | Only justified minimal safeguards and inaccessible backup copies remain. | Display pending status, categories and expected deadline; do not report complete. |
| Completed | All covered personal data and reversible copies, including safeguards, are removed, or a separately approved applicable exception identifies exact retained categories, basis and expiry. | No silent exception, indefinite denylist or completion on operator opinion. |
| Recovery blocked, at any stage | Identity, required creation/writer finality, applicable object-resolution proof, Auth, inventory, backup or GC proof is missing. | Gates stay closed, references retained, finite automatic attempts stop, operator/privacy escalation follows. |

A successful read before closure may finish delivering bytes. Subsequent reads and all new upload/analysis/publication admissions must check the appropriate account/race gates. Do not use logout or a previously issued JWT as deletion authority.

## Race completion protocol

1. In the request transaction, acquire **account gate → race gate → lifecycle locks**, validate owner and close the race gate. The account may remain open for single-race deletion. Recheck time/lease after lock waits; record the deletion scope before external work.
2. Under that closed scope, build and reconcile a durable ownership inventory covering accepted and unaccepted raw objects, every registered result/run/version, partial preparations and orphan records. Include known operations whose SQL completion failed. Compare source rows, object registry and recovery ownership evidence; missing evidence or unknown legacy ownership blocks completion. Queue/DLQ draining or bucket listing alone cannot prove completeness.
3. Current D5d/D5e use Option A: preserve original G, immutable payload identity and response journals; verify the exact registered seal bytes, content type, no encoding and strong ETag; then require a known applied lifetime DELETE and subsequent exact-key absence. Proposed Option B may instead resolve sealed stable absence only after every invariant below is established. Current 00029 cannot admit repeat attempts or that new terminal predicate; no caller may bypass it.
4. Before pruning any source/evidence, commit the necessary minimal closure information to the proposed independent restore register and verify its durable acknowledgement. An unavailable register blocks pruning, not the initial gate closure. Keep full recovery references while any outcome needs them.
5. In a final SQL transaction, reacquire the approved locks and re-read current authority, full inventory, object proofs, unresolved work and retention dependencies. Remove/close analysis and upload source rows only when their exact objects and recovery dependencies are resolved. Current FK RESTRICT/evidence guards require a dedicated reviewed cleanup path; do not disable triggers, cascade blindly, or grant general service-role erasure rights.
6. Keep the closed gate, consumed-intent binding and necessary tombstones until the safe-removal predicate below holds. A stale callback after cleanup must fail on missing evidence, never UPSERT a journal, source row or gate.
7. Record the live-erasure milestone, expire backup/protection copies by the approved schedule, verify final erasure, and only then permit final completion. A lost SQL response reconciles the same milestone and identity; it creates no provider authority.

The diagram records **current Option A**, not authorization for the proposed Option B:

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
        Note over D,R2: A needs settlement; proposed B needs its full invariant proof
    end
    D->>R: Persist closure before eligible source pruning
    D->>SQL: Revalidate all receipts/dependencies; prune eligible rows
    Note over SQL,R: Final completion waits for safe GC and backup expiry
```

## R2 recovery feasibility: options A, B and C

### Decision matrix

| Option | Resolution predicate and safety basis | Liveness and missing responses | Complexity / operational and privacy impact | Decision |
| --- | --- | --- | --- | --- |
| **A — current one-shot DELETE plus terminal receipts** | Known applied DELETE (or independently authenticated applied settlement), followed by exact-key absence, plus original guard/seal and writer-exclusion proof. | A lost admission/response can strand a present seal or already absent key. A terminal “not applied” receipt with a remaining seal still grants no second DELETE. Requires obtainable evidence and successful later reads; no arbitrary-unknown completion guarantee. | Existing mutation path is small; trustworthy receipt capture/verification/settlement and provider correlation are high-complexity additions, with another restricted personal-data store. May retain keys/evidence indefinitely in unresolved cases without an approved steady-state policy. | Current implementation remains in force. Retain as an evidence path where available; do not require a new receipt service solely to solve post-seal DELETE response loss. |
| **B — authorized repeat DELETE / sealed stable absence** | Positive durable seal certificate, all invariants I1–I10 below, permanent same-key non-reuse and a successful direct exact-key absence observation. Historical request outcomes may remain unknown. | A lost response is recoverable: if the exact seal remains, a fresh current claim may journal a bounded new DELETE; if absent, record sealed stable absence. Delayed DELETEs commute. Requires eventual successful mutation/read and fair authorized recovery; no fixed completion time during outage or after budget exhaustion. | Medium–high: raw/result attempt journals, narrow RPC/privilege rules, adapter/reconciler changes and a distinct terminal proof; strongest work is writer/non-reuse/restore enforcement. Fewer provider-finality dependencies, but still sensitive evidence, request cost and finite backup/GC requirements. | **Recommended conditional design for eligible sealed keys. No implementation approval.** Not applicable to unknown initial guards, legacy writers or unproved key retirement. |
| **C — other provider finalizer** | Would need a documented conditional/version-addressed DELETE, durable deduplicated operation/finality service, or another independently proved erasure boundary. | None reviewed supplies a stronger independently demonstrated end-to-end solution. Lifecycle deletion is available but still needs B's no-recreation proof and has no hard completion bound. | High/unknown if a new service, namespace or encryption scheme is introduced; potentially changes trust, credentials, retention, cost and ADR-003/005 identities. | No independently sufficient replacement established. Do not assume SDK features or another S3 provider's behavior apply to R2. |

Complexity estimates describe affected components, not delivery dates. No new receipt registry, DELETE attempt, terminal state or provider feature is authorized by this comparison.

### Evidence classification

| Classification | Fact or claim | Limit |
| --- | --- | --- |
| **Official R2 guarantee** | Conditional PutObject headers are evaluated atomically against state at commit. | Use the documented S3 surface selected by D5c/e; do not assume cross-key conditions or SQL-aware provider authorization. [Conditional operations](https://developers.cloudflare.com/r2/api/s3/extensions/) |
| **Official R2 guarantee** | Direct bucket reads/deletes are strongly consistent; the last completed competing mutation wins. A negative read does not cancel/wait for an unknown PUT. | No request-finality inference, time bound or cancellation follows. Public/cache paths have different behavior. [Consistency](https://developers.cloudflare.com/r2/reference/consistency/) |
| **Official API surface** | Workers delete accepts keys and returns void; S3 DeleteObject is documented as supported. | The reviewed R2 docs do not establish commit-time DeleteObject If-Match, version-targeted deletion, an idempotency token or a complete terminal-execution query. An SDK exposing such a parameter is not provider support. [Workers reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) |
| **Current local implementation** | 00029 has unique run/object DELETE rows, dispatch only on first admission, immutable response outcomes and an applied-plus-absence terminal check. S3 adapters set maxAttempts to 1. | SQL cannot inspect R2; local tests/source inspection do not prove real provider behavior or exclude old deployments. |
| **System premises to establish** | Exhaustive writer inventory, permanently retired exact keys, durable closure, current authority and a restore process that cannot recreate G/P/registration. | These are not supplied by R2 consistency and are not yet established system-wide. |
| **Logical result, locally testable** | Given I1–I10, the post-seal reachable set is only seal/absence; repeat DELETE preserves it and absence is absorbing. | A model can test interleavings and exhibit broken-premise counterexamples. It cannot establish production inventory, universal provider behavior or a future restore policy. |

### Formal post-seal invariants

Let K be the exact provider account, bucket namespace and key; G/P/S are the registered guard, immutable payload and distinct seal states, with their exact bytes/type and checked distinct condition ETags. Let Ø mean verified live-object absence. “Irreversible seal” is the following whole-system property, not merely a marker currently visible in R2.

| ID | Required invariant |
| --- | --- |
| **I1 — authority** | Trusted SQL binds K, owner, race, original registration and deletion unit. Each new admission locks account → race → lifecycle and rechecks current claim/lease after waits. The race is irreversibly closed. Account deletion also closes the account; single-race deletion may leave it open only if no path can reauthorize this K. Missing gates deny admission. |
| **I2 — initial creation settled** | Every initial If-None-Match:* guard-create execution is conclusively finished/ruled out, with original known-applied G evidence for this eligible path. Exactly one admitted original guard and audited dispatch/no SDK retry are premises. Unknown initial creation or a hidden retry is ineligible even if G/S is positively observed. No new guard can ever be admitted for K. |
| **I3 — pinned conditions** | All surviving payload PUTs/retries use only original G and identical validated bytes. Seal attempts use only the registered pre-seal G/P conditions. None can use S, a newly observed ETag, unconditional PUT or If-None-Match. Their conditions do not match S or Ø. |
| **I4 — positive seal certificate** | Before the first DELETE, a current authorized verifier fully checks exact registered S bytes, media type, no encoding and distinct strong ETag at K, then durably binds that observation to original G/P evidence. A 412, missing read, HEAD metadata or caller success boolean alone cannot create the certificate. |
| **I5 — exhaustive mutation set** | After that certificate, only the incapable I3 PUTs and exact-key DELETEs remain possible. Exclude direct/legacy/unconditional writers, copy/multipart completion, import tools, provider-side ingestion and restore writes. Credentials and administrative paths are inventoried; revocation/deployment shutdown alone does not terminate an already accepted request. |
| **I6 — permanent non-reuse** | K is never used for another guard, payload, evidence object or owner, including after gate/source GC and bucket deletion/recreation. Restore never recreates G/P/S there, rolls back retirement, or dispatches a saved mutation. No waiting period is a substitute for this invariant while a DELETE may still execute. |
| **I7 — meaningful observation** | Absence comes from a successful authenticated direct exact-K read against the correct known account/bucket, with the provider's missing-key result. Cached 404, wrong bucket/endpoint, denial, timeout, body failure or missing log is not absence. It proves live state only, not physical erasure of provider residuals/backups. |
| **I8 — truthful durable evidence** | Original pending/uncertain response facts remain unchanged. Each application-authorized DELETE attempt is journaled before dispatch, bound to the same certificate/K and current claim, and has one explicit transport attempt. A separate sealed-absence proof records what is now established; it does not assert which DELETE applied or that requests ended. |
| **I9 — bounded work** | Finite persisted budgets/backoff govern new attempts; SQL admission-response loss does not redispatch the same attempt. Takeover can reconcile/read, and only a fresh permitted admission can send another attempt. Exhaustion grants no new sends or success. A current read-only reconciliation claim may still prove sealed stable absence; if S remains, another mutation requires explicit bounded recovery authority. |
| **I10 — lifetime closure and scope** | Retirement/admission/restore protection survives crashes and evidence GC by an approved mechanism. Object resolution is separate from whole race/account completion, Auth removal and expiry of all personal-data safeguards/copies. No indefinite identifying denylist is silently introduced. |

**Non-reuse is a material unproved premise.** “UUIDs are random” is not a deterministic lifetime guarantee. PR #14 accepts cloud UUIDv4 collision/reissue probability; that does not automatically settle result-run UUID scope, bucket namespace reuse, replay after GC or restore behavior. The owner must explicitly accept the applicable residual collision risk or approve another enforceable retirement design consistent with prior decisions. No global denylist, allocator, new key format or account-incarnation scheme is selected here.

### Why a late DELETE is different from an unknown initial guard

After verified S at time t_s, I2–I6 restrict reachable live state to {S, Ø}. By atomic commit conditions, every remaining G/P-conditioned PUT fails in either state. A DELETE maps S to Ø and leaves Ø empty. Induction over any ordering of these operations preserves that set. Therefore, after a valid absence read at t_a, all later permitted effects leave Ø.

This proves **stable state under the listed mutations**, not terminal execution of a lost request. D1 may still be in flight when D2 commits and the read returns absent; D1's later effect is harmless only because K can never hold another object. Requiring a receipt for D1 is unnecessary for this particular safety property.

An unknown initial If-None-Match:* creation is different: after deletion it can satisfy absence, recreate G, and potentially let a delayed old-G payload commit. The post-seal state set is then not closed. At-most-one successful competing create while the object exists is not a lifetime at-most-once guarantee after that object is removed. Neither A, B nor lifecycle expiration fixes that case without independent exclusion/finality or a different approved creation fence.

### Proposed Option B recovery procedure

1. Resolve the original guard and establish I1–I6 and the durable positive seal certificate. Never bootstrap B from a missing object or an arbitrary/unregistered seal.
2. Under a current claim, reconcile the same K and immutable evidence. If any G/P/unexpected object is observed after the certificate, stop and investigate an invariant breach; do not reseal or erase the conflict to conceal it.
3. If exact S remains, a narrow admission may create a **new bounded attempt** for that same condemned K, retaining all prior attempts. Disable automatic SDK retries; each returned admission token is dispatched at most once. If its SQL response is lost, that attempt stays unknown; a later current claim may admit a different attempt only after revalidating all premises.
4. After any response or timeout, perform a fresh exact-key read. If S remains, retain pending work; if the read is unavailable, retain uncertainty; if Ø and the certificate/retirement proof plus prior deletion intent/attempt evidence are valid, record **sealed stable absence** under current SQL authority. This read does not declare an earlier operation failed or complete.
5. Duplicated or delayed DELETEs may still finish after that proof, claim expiry, source pruning or Auth removal. I6/I10 must make their only possible effect harmless forever. No new sends may be admitted from a stale lease or restored journal.
6. Preserve response uncertainty and the stable-absence proof until the separately approved evidence/backup GC predicates hold. Finite automatic retry exhaustion has no completion effect.

Safety does not require all DELETEs to finish. **Liveness is conditional:** at least one authorized erasing effect and a later successful read must occur while the premises remain true. If all DELETEs fail, the seal is locked, reads never succeed, admission never recovers or the mutation budget exhausts while S remains, B cannot promise termination or a 30-day bound. A successful current read-only stable-absence reconciliation remains possible after mutation-budget exhaustion. It does remove the response-loss-only dead end after an actual erasure.

For both raw and result paths, a future implementation would need to replace the unique-lifetime admission assumption with per-attempt evidence and a distinct object-resolution proof. In 00029, begin_result_object_delete, confirm_result_delete_absence, result_delete_is_resolved and the terminal trigger explicitly enforce A; raw D5d has analogous checks. Do not set an uncertain outcome to applied, bypass a trigger, reset an attempt, or route B through the current applied-only predicate.

### Option A: when terminal receipts help

A retains known applied DELETE plus subsequent exact-key absence. An authenticated independent original response/terminal provider record must correlate K, original operation/condition, execution identity and effect, with complete coverage where future capable writes are at issue. A receipt proxy has its own crash gap and cannot invent provider finality. A known failed DELETE with S present settles history but cannot finish A's erasure without changing its rule.

R2 Data Access Logs are best effort, may omit events, exclude HTTP failures at 400+, and are not retroactive. Positive events are corroboration; missing events prove nothing. Configuration audit logs concern bucket changes. Notifications lack deleted-object ETags and do not establish every outstanding execution. [Data Access Logs](https://developers.cloudflare.com/r2/buckets/data-access-logs/), [audit logs](https://developers.cloudflare.com/r2/platform/audit-logs/), [notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/). No sufficient general terminal-receipt lookup was established. Enabling logs or a new receipt repository requires separate privacy/region/retention/cost approval.

A is safe under its prerequisites but not universally live: “S deleted, response lost, no receipt obtainable” remains unresolved even though live state may be empty. It also still fails if the writer/non-reuse premises are violated; a receipt cannot prevent a later unguarded PUT or restore.

### Option C: provider mechanisms considered

| Candidate | Official capability / missing guarantee | Feasibility result |
| --- | --- | --- |
| Conditional or version-addressed DELETE; durable idempotency/finality service | The reviewed R2 interfaces do not establish the required commit-time comparison/deduplication/finality contract. Workers' object version metadata is not by itself a version-targeted DELETE API. | No supported solution established. If later documented, review exact identity, stale-condition and response-loss semantics; do not infer support from AWS SDK headers. |
| Object lifecycle expiration | R2 documents expiration rules and typical processing timing, not a hard erasure deadline. [Lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) | Can eventually remove S only under B's same no-recreation premises. It is an alternative erasing actor, not initial-guard finality. Prefix/rule scope, other objects and SQL authority need review; no advantage sufficient to recommend it over explicit bounded DELETE attempts. |
| Bucket retention lock | Locks block overwrite/deletion; they do not prevent creation of absent keys. [Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) | Not a finalizer. A retained seal remains personal integrity state, and removing the lock restores the original initial-guard problem. |
| Durable Object/proxy, namespace destruction, encryption/key destruction | A proxy cannot atomically couple SQL to R2 commit; bucket/namespace or cryptographic erasure would need a new independent proof, backup/key coverage and architecture/contract review. | No demonstrated in-scope completion mechanism. Moving a key or forgetting an encryption key is not assumed to erase all covered copies or terminate old writes. |

For any future C candidate, safety still requires trusted exact-object/owner authority, exclusion or provider-enforced fencing of every creator, and protection against a stale deletion removing a different generation. A conditional DELETE by itself does not stop a delayed If-None-Match guard from recreating an absent key. A deduplicated finalization service would additionally need a durable operation identity bound to that generation and a documented terminal-status/retry contract that survives response loss and restore. Its liveness would require eventual erasure and retrievable proof under that contract; none was established. Lifecycle-based C instead inherits I1–I10 and requires eventual expiry execution without retention locks. It supplies no hard time bound.

### GDPR/retention and operational consequences

A can keep personal object references and journals unresolved after live data disappears; a provider-dependent receipt store adds another retention obligation. B permits object-level reconciliation without pretending lost responses are known, which can reduce that unnecessary retention. It still needs minimal seal/attempt/retirement evidence, finite budgets, restricted access and an approved way to preserve non-reuse after those identifying records are erased.

Neither option waives backup/Auth/retention obligations or supplies a lawful exception. Unknown initial guard/legacy cases remain pending at a deadline. The 30-day account target, proposed extension to race deletion, 7-day backup goal and 24-hour safe-GC window below remain unapproved values subject to actual copy inventories. No SLA follows from a provider consistency guarantee.

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

- Trusted ownership inventory is complete; all required objects have the approved resolution proof; no unknown initial guard or capable legacy write remains. Under current A an unresolved lifetime DELETE blocks removal. Under approved B its original response may remain uncertain only when sealed stable absence and permanent harmlessness of every late DELETE are proven; never erase uncertainty to satisfy A.
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

Unknown capable writes or unproved key retirement create a real tension between retained recovery data and finite erasure. B addresses only the post-seal DELETE-response case under its invariants; it does not turn unknown initial guard creation into a settled effect. The remaining tension cannot be solved by a TTL. At exhaustion/deadline, the controller/owner must decide an enforceable technical resolution or a separately justified applicable retention exception with scope/review/expiry; an operator cannot declare one. Record the unresolved risk and avoid rollout promising a completion guarantee that cannot be met.

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

If deleted personal data is accidentally restored or a provider operation is accidentally replayed, contain it and treat it as a recovery/security/privacy incident. Do not reset an old operation to pending or use a retry to hide the breach; recreating a condemned object violates B's premises. Remediation needs a separately reviewed current operation/identity protocol. No restore process may silently discard an unresolved case.

## Failure scenarios and counterexamples

The safe B rows assume every invariant; the counterexamples deliberately break one. They are proposed adversarial cases, not executed provider tests.

| Ordering or failure | Safety/liveness result |
| --- | --- |
| Payload commits before sealing | Seal conditioned on G loses; verify immutable P and seal against its registered ETag. Do not DELETE until exact S is positively verified. |
| Seal commits before delayed G-conditioned payload | Commit-time condition fails against S, and also against Ø after deletion. Repeating only that same G-conditioned payload does not change this result. |
| D1 is delayed; D2 erases S; read observes Ø; D1 commits later | Under B, D1 can only leave Ø. D1's outcome remains unknown; no receipt is needed for the stable-state proof. Without non-reuse this reasoning fails. |
| D1 erases S but all DELETE responses are lost | A cannot complete without an applied receipt. B may record sealed stable absence after a successful direct read and invariant revalidation. |
| D1 never reaches R2; S remains | A can strand the seal. B may admit D2 under a current claim and bounded budget. If every attempt fails or the budget exhausts, neither may report success. |
| Final read response is lost | Read-only reconciliation can repeat. No response, error or negative log is a terminal proof; B needs a successful direct missing-key observation. |
| Initial guard request/retry is still in flight; S is deleted; guard commits If-None-Match:* against Ø; old payload then commits If-Match:G | G and then personal payload can reappear. Positive earlier S and repeated absence reads do not prevent it. I2 fails: all options remain ineligible without another creation fence/finality proof. |
| A payload retry adopts S/newly observed ETag as its condition | It can overwrite the seal while present; the {S, Ø} proof no longer applies. I3 forbids acquiring new payload authority from observation or a new lease. |
| Legacy/unconditional PUT, CopyObject, multipart completion or importer commits after Ø | It can recreate content. I5 fails. Removing a credential or stopping a Worker does not prove its previously accepted request stopped. |
| K is reused for a new race, evidence object or owner; old unconditioned DELETE finishes | The old request removes the new object. This is a concrete destructive counterexample to B without lifetime non-reuse; current lease expiry cannot fence R2. |
| Bucket is deleted/recreated with the same account/name/key addressing; old DELETE still addresses it | Bucket-name reuse is not proven namespace retirement. Reusing the address requires excluding old effects or a new provider-enforced identity boundary; do not assume bucket recreation invalidates requests. |
| Restore writes original G; paused old-G payload commits | GPS can resurrect despite closed SQL gates. Restore must never submit that write. Replaying old open registration/gates also allows a new guard and invalidates B. |
| Privileged SQL re-creates registration after GC, valid intent is re-consumed, or a stale callback UPSERTs a missing row | New G/reuse can become possible. Missing gates and expired/consumed intents must reject, including direct privileged paths. A retained SQL “sealed” label alone is insufficient. |
| Claim expires after D1 admission; takeover admits D2 | New sends require current authority. Already dispatched D1 may still commit; B tolerates it only at the permanently condemned K. Stale SQL completion remains rejected. |
| SDK automatically retries initial guard versus retries DELETE | A delayed guard retry can recreate G and is forbidden. A duplicate exact-K DELETE is state-safe under B, but hidden retries violate journal/budget premises; keep SDK maxAttempts=1 and explicit application admission. |
| Cached 404, wrong account/bucket, denied GET, malformed response or body failure is called absent | Live content can remain elsewhere. I7 fails; neither option may complete from that observation. |
| Provider bucket lock/permission failure prevents deleting S | S remains and liveness fails until separately authorized resolution. No automatic lock removal, retention exception or successful absence inference follows. |
| Single-race deletion leaves the account open | Safe only if the race/K remain permanently closed/non-reusable. Fresh creation may issue a different race; account openness is not permission to re-register this K. Account-wide deletion closes both scopes. |
| SQL admission/outcome/proof response lost; duplicate messages | Preserve original evidence; reconcile same unit. A never re-dispatches; proposed B can later issue a distinct authorized attempt, never replay the lost admission token. |
| Partial source pruning, missing restore-register watermark or backup replay | Keep recovery dependencies, quarantine restore, and refuse final erasure/GC until coverage is established. B object resolution does not waive account/Auth/backup completion. |
| Auth response loss, old JWT or delayed Apple exchange | Exact-project verification and closed/missing gates remain necessary. Test re-provisioning separately; B supplies no Auth deletion guarantee. |
| TTL or automatic attempt budget expires | No evidence eviction, force-complete or inferred lawful exception. Escalate the unresolved category with its exact reason. |

## Exact proposed amendments — supplied for review, not applied

Each block is additive proposed wording. Acceptance is separate from approving this design PR. ADR-007's status stays PROPOSED until its explicit decision.

### ADR-006: add “Completion, residual protection and restore”

> Access closure, object resolution, live-data erasure, Auth removal and final deletion completion are distinct milestones. Retained identity-bearing protective records and recoverable backups remain personal data. They keep deletion pending unless a separately approved applicable retention exception specifies retained categories, purpose/basis, access, review and expiry. Automatic retry exhaustion, a target date or operator review is not completion.
>
> Auth removal follows resolution of all live race/object and ownership dependencies. Any remaining backup/protection responsibility must have a verified FK-independent owner before Auth cascades occur. Verify hard Auth removal, session/refresh handling and non-reactivation; already issued JWTs must not bypass closed or missing TackWise gates.
>
> A final completion decision requires current guarded revalidation of the full owned inventory, approved object-resolution evidence, safe removal of gates/tombstones/recovery records and expiry or erasure of recoverable copies. For an independently verified irreversible same-key seal, an explicitly approved stable-absence predicate may resolve live-object erasure without settling every DELETE response only when no capable creator remains and the exact key is permanently non-reusable. Original response uncertainty remains factual. Absence alone is insufficient. Restore must preserve that invariant and apply independently preserved closures before access or mutation. No retention period, lawful exception, register provider or activation is approved by this amendment alone.

### ADR-007: replace the proposed DELETE recovery rule with “Post-seal recovery and safeguard removal”

> Initial guard creation is never redispatched to settle an unknown outcome. Every such creation execution must be conclusively settled/excluded before this recovery mode is eligible. A positive guard/seal read, missing log, timeout or expired lease does not establish that fact.
>
> For each exact registered raw/result key, retain a durable certificate of full positive seal verification and original guard/payload identity. If the race admission is irreversibly closed, all remaining PUTs are restricted to pre-seal conditions that cannot match seal/absence, every other creator is excluded, and the exact provider account/bucket/key address can never be reused or restored, a current deletion claim may journal a new bounded exact-key DELETE attempt after an earlier attempt has an unknown outcome. Account deletion additionally closes account admission. Each attempt is dispatched at most once; automatic SDK retries remain disabled.
>
> A successful direct exact-key absence observation under current authority, bound to that certificate, deletion intent and permanent retirement proof, may record sealed stable absence. It does not assert that an earlier DELETE finished or failed. Original admission/response journals are immutable; new attempts and resolution evidence are separate. Unexpected content, unknown initial creation, capable legacy writers, unproved non-reuse or restore replay forbid this mode. Retry exhaustion is unresolved recovery state.
>
> After live absence, late DELETEs may only act on a forever condemned empty key. Safeguard GC must preserve that property without silently introducing indefinite personal-data retention. Valid 24-hour intents, ownership, Auth lifecycle, backup/restore coverage and all recovery dependencies remain prerequisites. The UUID collision/reissue risk and its raw/result/namespace scope require explicit owner decision; random IDs alone do not prove deterministic non-reuse. ADR-007 remains PROPOSED until explicitly accepted.

### ADR-005: add to the conditional publication/deletion boundary

> Immutable result payload bytes, digest, size and fixed run-derived key remain unchanged. After the separately authorized original-G/P-to-registered-S seal is fully verified, the approved post-seal recovery boundary may admit bounded distinct DELETE attempts and sealed stable absence only under ADR-007's exhaustive writer exclusion and permanent exact-key non-reuse/restore invariants. No attempt may create a guard, acquire a new payload condition, overwrite a payload, or rewrite an original uncertain response. This is an explicit extension of deletion authority, requiring separate approval and provider proof.
>
> Immutability protects original operation evidence while retained; it does not approve indefinite retention. A narrowly authorized completion/GC path may destroy preparations, journals and source references only after the approved object-resolution proof, no remaining recovery dependency, and replay/restore-safe finite retention are demonstrated. It must serialize with outcome recording and prevent missing-row recreation.

### ADR-003: proposed raw-object recovery clarification

> The fixed raw key and immutable accepted raw bytes remain unchanged. Raw guard creation must be conclusively settled and the original guard condition retained; no recovery may create another guard or admit a legacy/unconditional payload write. Once a separately authorized same-key raw seal is positively verified, repeat DELETE and sealed stable absence require the same current-claim, exhaustive writer-exclusion, permanent key non-reuse and restore predicates as the approved result recovery protocol. They create no general deletion bypass or right to reuse a deleted identity. This clarification requires explicit approval before changing D5d behavior.

### Retention policy: proposed schedule amendment

> Subject to owner/privacy approval and verified provider capability, use the D5f candidate schedule: a 30-day operational target for race/account deletion, a maximum 7-day recoverable content-backup age without TTL renewal by copying, cleanup within 24 hours of each safe-removal predicate, and destruction of the independent identity-bearing restore register and all its copies within 24 hours after the last older content copy expires. Unresolved cases remain pending and receive explicit escalation; these values create no lawful-retention exception. Publish an accurate scope and period only after provider evidence and the coordinated restore drill demonstrate them.

## Required local and isolated provider proof

This follow-up performs document/source review and an inductive argument only. No executable model, SQL change, live R2 operation or provider drill was run. The following are requirements for a separately authorized implementation/evidence task.

| Evidence layer | Required work and observable assertions |
| --- | --- |
| Local conditional-commit model | Explore both payload/seal orders and arbitrary delayed D1/D2 ordering, lost admission/response/proof acknowledgements, expired claims and crashes. Assert that after certified S only {S, Ø} is reachable, and after observed Ø it remains Ø despite delayed DELETE completion. Preserve all unknown response facts. |
| Deliberately broken local premises | Enable one late initial guard, unconditional/copy/multipart write, new payload condition, K reuse, bucket-address recreation or snapshot restoration of G. The model must produce the counterexample rather than silently “prove” safety by excluding the adversary. |
| PostgreSQL/adapter design tests | Use barriers for account → race → lifecycle order, after-wait lease expiry, claim takeover, per-attempt admission/dispatch, bounded budgets, stable-absence proof and GC races. Reject wrong owner/key/seal, direct privileged fabrication, stale-token replay and uncertain-to-applied rewriting. Test raw/result paths independently and together. |
| Provider conditional semantics | In an explicitly approved isolated bucket with synthetic raw/result artifacts, verify exact marker bytes/type/encoding/ETags, pre-seal conditions, both observed winning orders, and failure of original-G/P PUT after S and after absence. Cover all chosen API surfaces; an AWS SDK result or local model is not R2 evidence. |
| Provider DELETE/GET behavior | Verify DELETE on S and on an already absent K, successful direct missing-key classification, independent clients/connections, and delayed duplicate DELETE after another deletion. Inject response loss without rearming guard authority; demonstrate recovery even when no DELETE response is available but a later read succeeds. |
| Limits of provider drills | A client proxy can delay delivery or hide a response; it cannot by itself pause a request already accepted inside R2 at commit. Identify which ordering was actually forced and retain documented commit semantics as the contract. Finite successful trials do not prove universal behavior or request finality. |
| SDK/egress and writer inventory | Pin and audit maxAttempts=1, application resend paths, deployed/old Workers, scripts, S3 credentials, bindings, copy/multipart/import/lifecycle and administrator capabilities. Show no hidden guard-create or fresh-ETag retry can occur. Record inventories without logging personal payloads or credentials. |
| Non-reuse, closure and restore | Prove admission rejects same-K re-registration after source/gate/intent GC; explicitly test result-run as well as race identity. Restore old SQL/Auth/key policies and object manifests in quarantine; do not dispatch old journals or recreate K. Demonstrate collision/reissue and bucket-recreation policy within the owner's accepted risk. |
| Recovery and retention | Force repeated network denial, provider retention locks, exhaustion and missing independent restore coverage. Exhaustion alone never completes; test that a current read-only B proof can resolve an already absent key, while a remaining seal cannot grant a new automatic mutation. Demonstrate approved finite evidence/copy expiry without deleting the last needed proof or retaining an unapproved permanent identity list. |

**Go/No-Go:** B is structurally feasible for already eligible sealed objects using the documented conditional-write/read/delete model. Implementation/activation is **No-Go now** until its precise predicates, raw/result scope, non-reuse risk, authority/budgets, ADR amendments and provider/D6 evidence are approved and demonstrated. For arbitrary unknown initial guards, capable legacy writers or unproved restore/key retirement, no safe terminating design has been established.

## Acceptance criteria and remaining decisions

A later implementation/D6 review must demonstrate:

1. Complete owned inventory across accepted/pending/orphan/historical states; cross-owner, legacy NULL-owner and empty-registry negative cases; retained source identity across raw/result composition.
2. Local PostgreSQL multi-session barriers for approved lock order, expiry after waits, source pruning, outcome recording, gate GC and direct privileged bypass; no premature terminal transition.
3. Injected conditional-commit tests plus isolated provider evidence for payload/seal orderings, original-G delays, exact seal bytes/type/ETag, unknown guards/DELETEs and duplicates. Offline tests alone do not satisfy this criterion.
4. Separate A/B proof acceptance: reject forged/unrelated/stale receipts or seal certificates; original journals unchanged; negative logs/reads alone unresolved. Initial guard redispatch is always rejected; B attempts require every invariant and cannot reuse an old admission token.
5. Crash recovery at each register/SQL/provider boundary, including lost durable acknowledgements and reconciliation after attempt exhaustion.
6. Supported Supabase hard-delete/identity/session proof, cascade inventory, outstanding JWT rejection and isolated Apple/Auth delayed-exchange/re-registration evidence. No real user/credential experiment is authorized by this document.
7. Trusted-clock/intent-expiry and consumed-intent tests across pruning and restore; no implicit renewal, gate opening or UUID reuse from stale input.
8. Seven-day candidate retention capability verified for every provider/copy, including WAL, manifests and register replicas; no rolling backup of identity safeguards extends the deadline.
9. Quarantined coordinated restore drills with newer R2/older SQL, newer SQL/older Auth, missing register watermark, old keys and old messages. Deleted data/identities never become readable or writable.
10. Minimal logs, restricted evidence access, documented operator escalation and privacy inventory/processing/retention/threat/CRA updates before enablement. User status accurately distinguishes pending, retained categories and completed erasure.
11. Separate reviewed implementations and explicit rollout authorization. All existing flags stay disabled; existing delivery branches and M1–M7 work continue independently.

| Owner decision | Proposed direction | Blocking uncertainty |
| --- | --- | --- |
| O1 — Post-seal recovery | Approve/reject B for eligible raw/result keys; keep current A until the explicit amendments and proof are accepted. | Permanent non-reuse, exhaustive writer/SDK inventory, current authority and restore safety are not yet established. Unknown initial guards remain blocked; no universal completion guarantee. |
| O2 — Finite periods and completion wording | Review the 30-day target, 7-day backup cap and 24-hour safe-cleanup deadlines; final completion waits for residual safeguards/copies. | Provider retention/copy inventory, operational feasibility and privacy necessity must support the values. |
| O3 — Auth and Apple lifecycle | Hard Supabase removal after dependencies; fresh explicit registration with a distinct UUID; choose the supported Apple revocation route. | Provider replay/provisioning behavior and any required token/subject retention or new-user-trigger constraint need explicit architecture/privacy approval. |
| O4 — Restore architecture | Approve or replace the independent deletion register, coverage watermark and quarantined restore interlock. | Storage/trust model, availability, access, keys, finite copy expiry and cost are unselected. |
| O5 — ADR changes and release evidence | Review the exact ADR-003/005/006/007 proposals independently; preserve the bounded existing approvals. | ADR-007 remains proposed. No amendment text, local test result or design acceptance replaces real-provider/D6 evidence or authorizes activation. |
| O6 — Key retirement and risk | Decide how lifetime address non-reuse survives source/gate GC, bucket lifecycle and restore; explicitly scope accepted UUID collision risk to the relevant raw/result identities. | No deterministic allocator/denylist, new key format, permanent identifying record or bucket-reuse policy is implicitly approved. If the invariant cannot be established within accepted risk, B is No-Go. |
| O7 — Attempts and recovery authority | Approve finite per-unit attempt budget, backoff, takeover and explicit operator recovery limits; keep SDK retries disabled. | A finite budget cannot promise termination during arbitrary outage. SQL permissions must prevent replay and arbitrary key substitution. |

The focused design is reviewable now. Safe final race/account completion remains blocked on the relevant decisions and proofs above; this document makes no completed-deletion or legal-conformity claim.
