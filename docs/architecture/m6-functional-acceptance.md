# M6 functional acceptance — 2026-10-31

## Evidence boundary

Current merged baselines: SailRaceApp `8fa17c6`, API `28e0c59`, contracts
`52d4a15`, Analysis `122d514`. This is a controlled owner acceptance procedure,
not production readiness or deletion approval. ADR-007 remains PROPOSED.
The operator reports working Apple/Supabase login, an uploaded 14 October race
and a visible production summary. This task has not read that race or contacted
providers. Existing D5 evidence is indexed in the [verification register](../security/adr-007-verification-register.md).

The ordinary library already composes logger → RecordedRaceSync → native session
and WorkerClient → RaceSyncCoordinator. Upload creates a server race identity,
validates immutable gzip, uses registered conditional private S3 storage and
PostgreSQL acceptance. Accepted uploads feed maintenance/Queue and the existing
analysis-v1 publisher. The browser uses the same authenticated Worker for summary
and seven-field owner detail, then shared map/replay/charts. No replacement runtime
implementation was identified. Existing `detailAvailable:false` metadata is
intentional: separate explicit detail capability controls the button.

The compatibility harness formerly pinned API PR #49; the accompanying change
pins merged API/contract revisions while retaining clean-source and exact-revision
checks. This is synthetic client/handler/contract evidence, not provider evidence.

## Consolidated operator authorization and preflight

Record one bounded approval covering the intended owner account, the existing
race read, optionally one new short recording/upload/analysis, evidence retention,
recovery contact and permitted configuration/deployments. Physical iPhone actions
are performed by the operator. Do not infer authorization from existing true flags.
No production write, deployment, migration, Secret/flag change or rotation is
performed by this task. Obtain the documented temporary detail-alpha security
approval before accessing real GPS; retain the server allowlist and owner checks.
The broader product direction does not itself remove that current gate.

Before either run, verify the exact API, consumer, Pages and installed iPhone
revisions, same Supabase Auth UUID on iPhone/browser, entitlement and open gates,
existing migrations through 00029 and their runtime grants. Report drift rather
than automatically applying migrations. Verify private bucket identity and existing
server credentials without exposing values. Confirm exact CORS origin, private
no-store responses, NEL/reporting approval, absence of GPS logging and approved
retention/restore constraints. Reuse unchanged register evidence.

For detail require `ANALYSIS_READ_API_ENABLED=true`,
`ANALYSIS_DETAIL_READ_API_ENABLED=true`, and valid server-only
`ANALYSIS_DETAIL_ALPHA_OWNER_ID` equal to the verified owner. Frontend requires
`VITE_CLOUD_ANALYSIS_ENABLED=true` and `VITE_CLOUD_DETAIL_ENABLED=true` at build
and the existing Auth public configuration. These names document prerequisites;
they authorize no changes. Confirm actual Workers plan/CPU budget and isolate
memory margin against API `docs/evidence/m4b-detail-resource-profile.md` before
activation. Local profiling does not qualify deployed CPU or concurrency.

For new upload additionally require existing `RACE_UPLOADS_ENABLED=true`,
`ANALYSIS_PROCESSING_ENABLED=true` on API and consumer, producer `ANALYSIS_QUEUE`
and the intended consumer/DLQ. Do not enable cleanup or race/account deletion.
Install the normal signed app containing recorded-library sync and recording stop
controls; do not use the synthetic native-test bundle for this real-recording run.

## Run A — existing accepted race first

1. Sign in on the website with the approved owner. Select the 14 October race;
   require ready status and an existing published summary. Do not re-upload,
   requeue or recalculate. If details are absent, stop and record the sanitized
   error/status; do not fabricate data or change the stored result.
2. Explicitly open detail. Confirm the expected GPS track, replay play/pause,
   scrub/speed/end, speed chart and only available wind/VMG/start/leg values.
   Missing telemetry must remain missing. No course geometry is invented.
3. Close/reopen, switch race, log out and switch account: old detail must vanish.
   No automatic second account login is required; use only separately authorized
   synthetic cross-owner checks. Store pass/fail/categories and revisions only,
   never GPS screenshots, keys, UUIDs, tokens or response bodies in public evidence.

## Run B — one new physical recording

1. After explicit write approval, sign in on iPhone; record a short intentional
   race. Stop and confirm local completion. Start no new recording during sync.
2. In Analysis → Library explicitly press Synchronize once. Observe upload
   accepted and retained local recording. Acceptance is not analysis completion.
3. Inspect bounded safe operational outcomes: accepted race, one Queue envelope,
   consumer claim, published result and ready summary. Correlate actual IDs only
   in approved private evidence. Browser must display that same race, then repeat
   Run A's detail checks. A bounded wait without ready status is failure/diagnosis,
   not permission to re-analyze or create another identity.
4. Collect retry/interruption/ownership evidence locally first. Any real network
   interruption or repeat transfer needs inclusion in the approved scope; reuse
   the existing journal and explicit retry, never clear unknown outcomes or local
   recordings. Stop on identity mismatch, ambiguous issuance or provider failure.

## Completion, disablement and remaining gates

Record A and B separately: revisions, approval reference, device build, UTC time,
accepted/ready/detail outcome and sanitized failure category. A source/mock pass
cannot fill a live result. If detail must be disabled, the approved operator can
close the backend detail flag and rebuild Pages with frontend detail capability
off; delivered bytes cannot be recalled. Preserve local data/journals and escalate
uncertainty; do not use deletion as acceptance cleanup.

The broad Builds/R2 principal remains a register risk (TW-D5-012/013). Plan its
replacement by privately mapping actual consumers, deriving minimum deployment
and bucket scopes, separately approving replacement, validating deployment and
only then retiring old authority. No rotation is performed here. Legacy writers,
unknown-outcome settlement, finite retention and quarantined backup/restore remain
TW-D5-014/016/019–022 release/deletion work, not excuses to duplicate local UI code.

## Local validation in this change

- SailRaceApp: `sync:compatibility` **5 passed** against pinned merged API and
  contracts; `vitest run src/services/sync` **143 passed**, including recorded
  composition, coordinator, native-session isolation, retry and immutable material.
- API: **321 passed** in 8 existing detail/contract/boundary/read/queue/maintenance/
  content/fencing test files. No new provider, SQL or CPU-profile run is claimed.
- Analysis: full existing suite **131 passed**, including live flag OFF/ON,
  owner detail, session changes, map/replay and missing/error states.
- All three TypeScript builds passed; both client Vite builds passed.
  `git diff --check` passed. No runtime implementation changed.
- Locked SailRaceApp installation reports 16 dependency findings (15 moderate,
  1 high); API and Analysis installations report zero. This is dependency-manager
  output, not an exploitability assessment. Preserve existing dependency review
  requirements before distribution; no automatic dependency upgrade was made.

These are 600 local tests with synthetic/injected boundaries. They do not prove
live R2/Supabase consistency, deployed Queue processing, physical native behavior,
production resource fitness or safe deletion. The existing operator-reported
14 October summary is the live functional evidence available to this task.

## Owner test authorization and provider metadata preflight — 2026-10-31

The product owner explicitly authorized using the **already uploaded 14 October 2026 race** and its previously published analysis for a restricted internal lab/acceptance test, accepting that this particular test dataset might become unusable. This is **data-use approval for the owner-only internal test**, not a waiver of GDPR/CRA or owner authorization; it does **not** authorize new production writes, object deletion, SQL migrations, flag/Secret changes, privileged-token rotation, deployments or an unrestricted beta. The provisional one-owner detail-alpha design in `tackwise-api/docs/analysis-detail-alpha.md` still requires its documented architecture/security approval and operational preflight before feature activation. ADR-007 remains PROPOSED.

A **direct, read-only Supabase provider query** on 2026-10-31, restricted to race dates around 14 October and returning only aggregate status/integrity metadata, observed:

- Exactly one race dated 2026-10-14 in the project's local timezone, `sync_state=ready`.
- Exactly one associated `analysis-v1` run with `status=complete`, registered immutable result identity and nonempty size/digest metadata.
- Its registered analysis preparation matched the completed result identity, and its source digest matched the accepted race.
- The result-fence record had a payload ETag and completed timestamp, both account/race admission gates were open, and analysis-owner equality held.
- Raw gzip and result artifacts were recorded as small (well below the browser's 16 MiB detail-response cap); the exact size is not itself a memory/CPU measurement.
- Database migration history was observed through 00029, and the relevant public tables reported RLS enabled. This is **not** evidence that every runtime grant, role, current deployment or provider object has been qualified.

The query returned **no GPS bytes, personal identifiers, object keys, account IDs, bearer tokens or Secret values**, and made no database changes. No API owner-authenticated GET, private R2 GET/If-Match, browser GPS render, new Queue delivery or new upload was executed. Database metadata does **not** prove that the sealed object remains readable, that actual Worker CPU/isolate limits are satisfied, or that a correct alpha allowlist is deployed. Do not repeat these DB checks unless the race/configuration changes or new contradictory evidence appears.

**Next bounded Run A gate:** review/record the temporary ADR-004 one-owner alpha decision and remaining privacy/security/resource prerequisites, verify current API/Pages deployments and the exact authenticated owner restriction, then obtain separate approval for any necessary production flag/Secret/build changes. Only afterward make one authenticated owner-read through the existing API/web UI; stop on any mismatch and use sanitized pass/fail observations. Run B (new physical recording and write) remains **separately gated**, even though the pre-existing test dataset is disposable.

## Additional read-only private detail RPC privilege preflight — 2026-10-31

An authenticated-API preflight examined the installed PostgreSQL function **metadata only**, not the race's private result or GPS:

- `public.read_owner_analysis_detail(uuid,uuid)` exists in the connected Supabase project and is callable by `service_role` only among the API roles inspected; `anon`, `authenticated` and `PUBLIC` have no direct EXECUTE grant.
- The function is `SECURITY DEFINER` with an explicit search path. Its owner is the dedicated `tackwise_analysis_reader` role, which is `NOLOGIN` and `NOBYPASSRLS` in the live provider catalog.
- This matches the narrowly scoped intent of merged API migration 00028. It does **not** prove the deployed Worker's Auth, owner validation, R2 integrity, response allowlist/CORS, provider performance or alpha owner Secret/flag configuration.

**Evidence surface:** read-only Supabase catalog/privilege query, 2026-10-31. No private user data, function execution, Secret values or production changes. Recheck only after migration/role-grant changes or contradictory evidence.

## Conditional detail-alpha approval — 2026-10-31

The product owner has now approved the **one-owner, existing-race** internal detail-alpha approach and conditionally approved its necessary server allowlist/flags and Pages build capability after explicit security, privacy, resource and deployment checks. This supersedes only the prior *pending authorization* for these narrowly specified configuration changes; it does **not** claim that any precondition has passed or that a config value was changed. The accepted bounded design is recorded in [ADR-004](decisions/adr-004-analysis-dispatch-lifecycle-and-cleanup.md#conditional-owner-only-gps-detail-alpha--owner-approval-2026-10-31).

Before enabling, record the exact alpha account through private verified Supabase identity metadata (not email), the active Worker CPU plan/limit and RAM budget, the privately checked R2/owner validation, sensitive OAuth/NEL logging decision, and a supervised session end time with a named operator responsible for reverting backend and frontend flags. Do not expose UUIDs, credentials or GPS in GitHub or ChatGPT. The current 14 October analysis result is small according to SQL metadata, but **no real deployed detail CPU/heap measurement exists**. There is no additional code feature to implement for Run A. Keep production detail OFF until the gate passes. Run B continues to require separate write authorization.
