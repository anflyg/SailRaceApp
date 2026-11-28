# Race performance — dependency-ordered Codex tasks

**This document is the detailed task/dependency reference, not the current execution order.** The owner-directed [lean delivery plan](race-performance-delivery-plan.md) starts with iPhone-only functionality and defers raw-v2/contract/cloud work until history synchronization is actually needed. In particular C4 is **not a prerequisite for developing local-only VMG calculations**; it remains a prerequisite for new-version recording/upload and verified app/backend parity.

**Status: proposed task plan, 2026-11-26.** Only the documentation work in PR #84 is currently authorized. Requirements, acceptance IDs D1–D10 and review gates G1–G5 are defined in the [technical design](race-performance-technical-design.md). New requirements must come from explicit owner decisions appended to PR #84, not from these tasks.

Each future assignment must name its owning repository, one branch/worktree/PR, approved inputs, exact scope, acceptance subset and stop condition. Fetch current main and read applicable AGENTS before edits. Reuse an existing relevant task PR for corrections. No task includes merge, deployment, feature-flag changes, live telemetry reads or production activation unless separately and explicitly authorized.

## C0 status after owner responses (2026-11-26)

The owner has now approved: manual-only alpha setting and advisory post-race feedback; 0–15 m phone-to-bow configuration range; bow-at-mark A/B capture corrected once; <=2° neutral start bias and whole-degree bias display; the direction of a new versioned raw format; and a **synthetic-only C13 feasibility study** using 1-second truth compared with 5-second sampling.

C0 is **partially dispositioned, not closed**. **New owner approvals:** G1 reads the currently configured alpha for new calculations, while already accepted Wvmg stays frozen until next accepted reference; G2 displays `—` for both TTL/BURN when current reliable HDG is missing (including zero bow offset). **Still open:** safe mid-window reset, race recovery and snapshot (G1); missing-HDG A/B *capture*, setting storage/default/provenance and legacy A/B protection (G2); exact versioned history lifecycle/contracts/privacy (G3); G4 evidence-based metrics after C13. No implementation authorization follows. Proposed ADR-010–012 remain **PROPOSED**; no coding authorization follows. Reuse this PR for follow-up C0/C1/C2 decisions. C13 may be separately scoped and authorized for isolated synthetic investigation without any production code or real race data.

## First: resolve design choices with small documentation tasks

| ID | Repository and dependencies | Concrete assignment / deliverable | Completion and stop condition |
| --- | --- | --- | --- |
| C0 | SailRaceApp; this PR | Review proposed ADR-010/011/012 and record G1–G4 dispositions in **PR #84**. Select lifecycle, bow fallback/endpoint semantics, history versioning and metric feasibility scope. | Each choice accepted/rejected/deferred with owner and date. Never mark all ADRs accepted merely because product D1–D10 were approved. No implementation. |
| C1 | SailRaceApp; C0/G1 | Finalize Wvmg lifecycle matrix: prestart/gun/accept/reject/alpha edit/Course mismatch/tab/background/Continue/account/new race. Specify checkpoint atomicity and source-time ordering. | Lifecycle matrix and synthetic fixtures specified for D1/D2/D5; ADR-010 remains PROPOSED until G1/G3 approval. Stop implementation on unresolved snapshot/owner/persistence policy. Documentation only. |
| C2 | SailRaceApp; C0/G2 | Finalize D7/D9 pure geometry and setting/fallback/endpoint policy; D8 R/S placeholder/layout spec. | Approved ADR-011 and numerical fixtures for D7/D9; owner-reference layout and supported device matrix for D8. No new telemetry. |
| C3 | SailRaceApp; C1 plus C0/G3 | Define minimized history/purpose/cadence/bounds and local recovery/export/delete/backup lifecycle. Draft exact inventory/processing/threat/CRA amendments. | G3 review disposition and ADR-012 data choice; unresolved retention/deletion stays blocking collection. Do not repeat unaffected provider checks. |
| C4 | tackwise-contracts; C3, G3/G4 | Contracts-only task for selected raw lineage, analysis result/summary and owner projection versions, units/null/uncertainty/limits and old-client behavior. | Golden valid/invalid old/new fixtures and compatibility matrix; approved shared schemas/types/docs. No API/database/deploy edits. Read its own AGENTS first. |

## Then: separately authorize implementation slices

| ID | Repository and dependencies | Small bounded assignment | Required evidence / boundary |
| --- | --- | --- | --- |
| C5 | SailRaceApp; C1 and implementation authorization | Implement pure Wvmg reducer and once-only acceptance seam, no logger/persistence/UI wiring. | D1/D2 circular/quality/replay fixtures; old tactical trace outputs unchanged (D4). No cloud or native redesign. |
| C6 | SailRaceApp; C5, C3/C4, approved local recovery design | Implement checkpoint/history/local export only; preserve recovery prompt, snapshot and account boundary. | D5 plus D6 ordering/export/corruption tests, crash boundary cases. No upload writer upgrade in this slice. |
| C7 | SailRaceApp; C5/C6, approved gating/contract policy | Wire same Wvmg selector to Sailing and recording with existing GPS gates. | D1/D4/D5/D6 parity fixtures and visual regressions. Pending new raw upload capability stays disabled; no live wind presentation additions. |
| C8 | SailRaceApp; C2 and implementation authorization | Implement bow transform and zero/default setting; wire TTL/BURN. | D7 pure geometry and missing-HDG UI/native cases. No recorded coordinate or cloud schema change. |
| C9 | SailRaceApp; C2 and implementation authorization | Implement Course favored-end/bias helper and UI. | D9 swap/neutral/invalid/uncertainty fixtures; TTL/BURN unaffected. Independent of C8 and Wvmg. |
| C10 | SailRaceApp; C2 and implementation authorization | Restore R/S using shared calibrated values and existing stream. | D8 layout/placeholder/sign checks; no new persisted fields. Independent of C5–C9. |
| C11 | tackwise-api; C4 and separate security-reviewed implementation authorization | Add new raw-version validation/read capability only, preserving strict old handling and private immutable upload protocol. | Contract/malformed/limits/old-version tests, source/ownership checks. Split any needed SQL migration into its own reviewed task with explicit grants/revokes. No dispatch/activation. |
| C12 | SailRaceApp; C4/C6/C11 plus client authorization | Add explicit new-version upload projection and immutable retry artifact support. | End-to-end synthetic app→API contract compatibility, size bounds and unchanged old prepared bytes. No auto-upgrade accepted/pending artifacts or live upload. |

These implementation tasks are a plan, not permission. C5's transient math is independently reviewable, but C7 must not ship a recording/analysis mismatch while C11/C12 are missing.

## Analysis feasibility before metrics and web rollout

| ID | Repository and dependencies | Concrete assignment | Completion and stop condition |
| --- | --- | --- | --- |
| C13 | tackwise-api, isolated synthetic tooling; C0-approved experiment scope | Assess D10 at existing 5-second cadence using synthetic 1-second truth/downsampling; evaluate D3 pair comparability and wind-shift confounding. Do not change production algorithms. | Report timing/minimum/recovery error, false positives and unavailable cases. Propose measurable thresholds for G4; no real race collection, new sensor logging or contract requirement inferred from convenience. |
| C14 | SailRaceApp; C13 + G4 | Finalize D3 suggestion policy/UI and D10 classifications/metrics/quality thresholds. Update ADR-012 and C4 follow-up schemas if necessary in their existing relevant PRs. | Owner-approved definitions/limits and labelled fixture expectations. If five-second data is insufficient, specify unavailable outputs or seek separate logging approval. |
| C15 | tackwise-api; C4/C11/C14, separate implementation authorization | Implement deterministic new-version tack-angle/maneuver analysis over approved inputs. | D3/D6/D10 golden outputs, missing-history fallback, bounded CPU/memory and result sizes. No historical retarget/reanalysis/dispatch. |
| C16 | tackwise-api; C15, separate security-reviewed task | Integrate new result version into persistence/owner projection/validators under existing lifecycle protocols. | Version/owner/closed-gate/session-independent API negatives, private immutable results and bounded summary. Any migrations separated; no production processing/flags. |
| C17 | SailRaceApp; C6/C14 | Show post-race tack-angle observation/suggestion in Settings using completed-race evidence. | D3 read-only suggestion, explicit user setting action, no live feedback and no persistence expansion. |
| C18 | TackWiseAnalysis; C4/C14/C16 | Add new result parser and maneuver/angle comparison UI to existing owner-detail/replay seam. | D3/D10 unavailable/historical/session-clear/replay tests and synthetic visual review. No direct R2/Supabase data reads, browser persistence or live activation. |
| C19 | Owning repositories; affected slices complete, explicit native/on-water authorization | Build/run the exact app worktree, validate physical mast-mounted iPhone and on-water scenarios; consolidate safe build/commit evidence in PR #84 or its approved successor task documentation. | D1–D10 acceptance matrix with actual pass/fail and residual errors. No real-data publication or production activation. Separate release decision remains required. |

## Dependency summary

`C0 → C1/C2 → C3 → C4`; C5 follows C1; C6 follows C3/C4/C5; C7 follows C6. C8/C9/C10 follow C2 independently. `C4 → C11 → C12`; C12 also needs C6. `C13 → C14 → C15 → C16 → C18`; C15 also needs C4/C11, C17 needs C6/C14. C19 follows the affected integrated paths, including C12 for any cloud parity claim.

Do not bundle all repositories into one feature PR. Keep PR #84 as this documentation/design integration path; future code work belongs in explicitly authorized small PRs in each owning repository. No branch surgery or cleanup of another session's checkout is included.

## Current handoff and next safe action

Documentation changes only, starting on PR #84 at `29875613e2c6c4371faa10676029162d49bea5e0`, based directly on freshly fetched main `7a7f7ef3a8224b8df1d923562b309bb26c6d3d30`. Documentation verification covers diff scope, whitespace, local links and D1–D10 traceability. TypeScript/native/on-water acceptance is pending because no feature is implemented. Final documentation commit and any main divergence are reported in the handoff, not inferred from a build.

**Next safe action:** owner/architecture review C0 in the existing draft PR. The most consequential unresolved choices are recovery/alpha edits (G1), bow fallback and endpoint semantics (G2), data minimization/versioning/retention (G3), and confidence/performance-loss definitions supported by existing cadence (G4).

**C1 review handoff (2026-11-26):** The proposed [lifecycle matrix and fixtures](decisions/adr-010-vmg-wind-reference-lifecycle.md#proposed-lifecycle-matrix-c1-review-required) select full reacquisition on alpha edits, atomic recovery and source-time ordering. G1 and relevant G3 approvals, especially unsigned ownership, persistence/retention and snapshot compatibility, remain blockers; C5/C6/C7 are not authorized by this proposal.

**New owner Decision 11 (2026-11-26):** When the gun-time snapshot has no usable W0, the first later approved Course wind **may establish the race's fixed W0 once** and activate only future wind VMG. C1/G1 must reconcile this with the immutable original gun snapshot, existing Course/race matching, atomic checkpoint/recovery and owner/race binding; C3/G3 must include effective time/provenance, versioned history and no pre-origin backfill. This supersedes C1's previous permanent-unavailable assumption. ADR-010 remains PROPOSED; no implementation authorization follows.

**C3 review handoff (2026-11-26):** [Proposed G3 data model and review record](race-performance-g3-data-model.md) supplies candidate raw-v2 fields, limits, late-W0 ordering, lifecycle and security/privacy implications. G1 origin/owner/recovery decisions and G3 field, retention, backup and deletion approvals remain open. Next safe action: G1/G3 owner and contracts/security/privacy review of this proposal; only after dispositions authorize C4 contract work. ADR-010/012 remain PROPOSED; no collection or implementation is authorized.
