# Race performance — technical design proposal

**Status: PROPOSED, 2026-11-26. Documentation only.** Product requirements come exclusively from [PR #84](https://github.com/anflyg/SailRaceApp/pull/84), specifically [decisions D1–D10](../product/race-performance-change-decisions.md) at `29875613e2c6c4371faa10676029162d49bea5e0`. Product approval is not architecture, contract, security/privacy or release approval. Every solution and numerical tuning proposal below remains proposed. No implementation, migration, production configuration or historical artifact rewrite is authorized.

## Evidence and scope

Fresh `origin/main` was fetched on 2026-11-26. Dedicated checkout: `/private/tmp/tackwise-pr84-design`; branch `docs/race-performance-decisions-20261126`; starting head `29875613e2c6c4371faa10676029162d49bea5e0`; main and merge base `7a7f7ef3a8224b8df1d923562b309bb26c6d3d30`. Clean before document edits; no merge/rebase/cherry-pick in progress. The IDE's former `/private/tmp/tackwise-analysis-gui` contains no usable checkout. Unrelated untracked files in the API workspace are excluded.

Read scope and existing constraints (these establish baseline facts, not new product decisions):

| Source | Relevant finding |
| --- | --- |
| `AGENTS.md`; `docs/product/tackwise-race.md`; `docs/product/tackwise-analysis.md`; `docs/sensors.md` | Offline race operation; existing wind/UI behavior and session calibration; desktop replay context. No new requirements inferred from older proposals. |
| Accepted ADR-003/004/005/006/008 | Immutable raw/results, separate version axes, Worker-only owner reads, bounded processing, deletion/export, native true-north gate. Accepted designs have incomplete release evidence. ADR-007 remains proposed. |
| `docs/privacy/{privacy-design,data-inventory,retention-policy}.md`; `docs/security/{threat-model,cra-risk-assessment,adr-007-verification-register}.md` | GPS/derived race data is personal; no raw logs; minimization and lifecycle review. Existing provider/deletion evidence is not repeated or marked complete. |
| `src/domain/{windShiftInstrument,windReference,startLine,motion}.ts`; `src/app/AppShell.tsx`; affected race/course/timer/setup views, attitude hook, logger, settings and sync artifact adapter | Existing reference acceptance, VMG guards, phone-origin TTL and shared runtime R/S calibration. |
| `anflyg/tackwise-contracts` at `52d4a155f2bf324acf4f6f42baa766d672c5391e`: raw, summary, result, owner-detail schemas and upload documentation | Strict raw-v1 permits per-sample wind/optional heading, but only layline-tack events; result/detail v1 have no maneuver/history extensions. App's pinned raw snapshot matches the relevant shape. |
| `anflyg/tackwise-api` local source `83e274499ce82061c04270d1dcce530a38bc0a70`, `src/analysis-v1/analyze.ts` and its contract declarations | Backend uses sample wind then course wind; computes VMG whenever finite inputs exist, without app's live quality/freshness evidence. This is a source snapshot, not a deployed-state claim. |
| `anflyg/TackWiseAnalysis` at `75d06dbceaa8188075011dd360a0cbc1b911c9e4`: README, `src/data/{raceAccess,workerRaceAccess,ownerAnalysisDetail}.ts` | Strict version/field parsing must evolve deliberately; private detail lifecycle remains memory-only. Synthetic access is separate. No unrelated web feature proposal used as product authority. |

## Design and acceptance by approved decision

The acceptance criteria are specifications for future tasks, **not tests reported passed**. D1–D6 share proposed [ADR-010](decisions/adr-010-vmg-wind-reference-lifecycle.md); D7/D9 use [ADR-011](decisions/adr-011-bow-origin-and-start-line-bias.md); D3/D6/D10 data and analysis use [ADR-012](decisions/adr-012-wind-history-and-maneuver-analysis.md).

### D1 — Three wind references

**Decided:** W0 is initial valid wind and scale origin; Wtactical retains current instrument behavior; Wvmg starts at W0 and changes only on accepted stable-tack references. VMG uses GPS SOG/COG.

**Proposed design:** Own a race-scoped VMG reducer above tab lifetimes in AppShell, alongside the tactical engine. Emit a discrete reference-accepted output from `collectReference`, including a monotonically increasing local acceptance sequence. Consume each acceptance once; never copy the continuously changing `estimatedWindHeadingDegrees` into Wvmg. Keep the tactical reducer's calculations/output unchanged. Wvmg carries provenance back to the approved W0; do not forge a native wind-capture measurement for derived wind or pass Wvmg to the existing W0 equality gate. Use a separate derived-reference validator plus the existing GPS gates.

**Contract/dependency:** No remote schema needed for a pure reducer, but production logger integration depends on D6 lineage review. Preserve `course.windDirectionDegrees` as W0.

**Acceptance D1:** For W0=180°, alpha=90°, accepting starboard mean=135° sets Wvmg=180°; later HDG=145° may move Wtactical but leaves Wvmg=180°. At SOG=6 kn and COG=150°, VMG is approximately 5.196152 kn; changing HDG alone cannot change it. A port mean of 235° later accepts Wvmg=190°. Invalid/magnetic/mock W0 never enables wind VMG. Circular means of 359° and 1° resolve near 0°, never 180°.

### D2 — Single-tack recalibration

**Decided:** Post-gun upwind acquisition uses existing 5-second identification then 30-second establishment, with seconds 0–20 settling and 20–30 sampling; one tack is sufficient. Starboard adds alpha/2, port subtracts it.

**Proposed design:** Reuse existing gates: candidate within 15° for five seconds, minimum five filtered samples, circular RMS spread at most 10°, accepted mean within 15° of expected tack. Those are baseline constants, not newly validated physical tolerances. Preserve existing upwind exclusion/hysteresis. Acceptance copies the locked mean and alpha used at that time. Rejected references never overwrite the last accepted Wvmg. Explicit internal rejection categories cover missing origin, pre-gun, excluded course, stale/non-true-north HDG, insufficient samples, spread and sector failure; no new live badges or raw diagnostic logs.

**C1 proposal:** [ADR-010's lifecycle matrix and synthetic fixtures](decisions/adr-010-vmg-wind-reference-lifecycle.md#proposed-lifecycle-matrix-c1-review-required) specify a full candidate and window restart on an actual alpha change, matching the existing tactical reset while retaining accepted Wvmg. All new calculations use current alpha. Unique-sample/coverage evidence and adverse-sea tolerances remain open; G1 approval is not implied.

**Contract/dependency:** Acceptance output is internal first; persisting mean/tack/alpha/evidence requires D6 approval.

**Acceptance D2:** No acceptance before the gun or during excluded 90°–270° courses. At 29.999 seconds no lock occurs; at 30 seconds a qualifying reference accepts once. A tack during settling restarts acquisition. Missing/expired HDG, insufficient samples, excess spread and sector failure preserve Wvmg. Replaying the same acceptance sequence has no effect. Test every boundary at the existing constants and 0°/360°.

### D3 — Post-race tack-angle feedback

**Decided:** Compare accepted opposite-tack means, prefer pairs within five minutes, comparable conditions and repeated observations; show a voluntary suggestion in Settings after sailing and web Analysis; never auto-change alpha.

**Proposed design:** Derive observed full angle as `abs(shortestAngleDelta(Hstarboard,Hport))`. Pair on acceptance timestamps within 300 seconds, same race and compatible north/quality/alpha epoch. Use median GPS speed over each reference window when sufficient reliable observations exist. Initial experiment: relative speed difference <=15%, three non-overlapping pairs, observed-angle spread <=5°. These are **candidate tuning values**, not approved requirements. Do not multiply confidence by reusing the same reference in many pairs. Use a median observation and compare with the configured alpha captured for that evidence epoch.

Two headings alone cannot separate a wind shift from a changed sailing angle. Wtactical is itself heading-derived, so agreement is not independent wind evidence. Treat suspected shifts, inconsistent pairs or missing speed as uncertain; withhold a confident suggestion. Do not claim wind-shift correction is solved. Post-race Settings could show the latest completed race's observation and a read-only suggestion below Slagvinkel, with any change requiring the existing explicit user setting action. Exact placement/text and evidence age need product/UI review.

**Contract/dependency:** Requires D6 accepted references and relevant speed/quality evidence; no R/S or continuous HDG collection implied. Web output needs ADR-012 result/detail version review. Historical missing references cannot be reconstructed as measured facts.

**Acceptance D3:** Starboard=135°, port=225° gives 90°; 350°/80° gives 90°. Swapping order preserves angle. A pair older than 300 seconds is excluded by this proposed first policy. Inconsistent/speed-incomparable or shift-confounded evidence yields uncertain/unavailable, not an adjustment. Repeated consistent synthetic pairs can yield a suggestion only under the approved policy; alpha remains byte-for-byte unchanged until user action. No feedback appears live in Sailing.

### D4 — Preserve live wind/VMG presentation

**Decided:** Figures, dots, scale, captions, colors and wind-specific interactions stay unchanged. Only D8 adds R/S independently.

**Proposed design:** Change the VMG input seam only. Reuse existing formatting/unavailable reasons. Keep instrument output, degrees-per-dot stepper, compass interactions and scale origin independent of Wvmg. Capture fixed-input baseline screenshots before implementation; compare wind/VMG regions separately from the authorized R/S region.

**Contract/dependency:** No contract change from presentation. D1/D2 calculation changes must pass this regression gate.

**Acceptance D4:** Under identical sensor traces, old and new tactical outputs match at each step. No extra VMG value, wind badge/control or live feedback appears. Original labels/colors/indicator order and scale remain unchanged, including withheld VMG and ±30° clamp. Check supported widths, translations and existing interactions.

### D5 — Offline state, fallback and recovery

**Decided:** Hold last Wvmg through failed calibration/tacks/downwind/HDG loss, retain GPS quality withholding, preserve race snapshot and account/session boundaries, explicitly design recovery.

**Proposed design:** ADR-010 proposes a minimal versioned local checkpoint, atomic with accepted-reference history: local race UUID, W0 identity, acceptance sequence/time, Wvmg, reference evidence/alpha epoch and derivation version. No auth tokens or new cloud dependency. On explicit Continue, verify race/snapshot/version/account binding, restore accepted Wvmg, discard in-flight windows, reacquire fresh sensors. Never infer elapsed settling time across backgrounding or restart. Tab changes preserve acquisition; backgrounding cancels pending acquisition and stops the existing native stream. End race stops updates; new race clears state. Corrupt/missing checkpoints fall back only to that race's usable W0, otherwise unavailable. An incompatible post-gun Course edit must not silently replace the locked race origin; retain mismatch withholding and the last accepted reference as specified in the proposed C1 matrix.

**Open:** Crash durability, local owner binding for unsigned/local races, account change handling, checkpoint storage and cleanup must be approved under G1/G3. No new persistence is implemented by this document.

**Contract/dependency:** Local recording/recovery/export schema changes need review even if never uploaded. This checkpoint is not an R/S calibration persistence change.

**Acceptance D5:** Airplane-mode traces produce the same calculations as connected traces with zero new network requests. Tabs do not restart the 5+30-second process. Background/restart does not accept stale settling samples. Explicit Continue restores the last compatible acceptance without recording before that choice. New race/account change cannot inherit another race's Wvmg. Stale/unreliable GPS still hides VMG despite retained Wvmg; fresh GPS can restore it without a new tack. Corrupt checkpoint never supplies fabricated wind.

### D6 — Minimized explainable history

**Decided:** Preserve W0, accepted Wvmg history, stable-tack references, enough tactical evolution, and the wind used for each recorded sample's VMG. Exact storage/versioning requires review; raw-v1 must not be silently extended.

**Owner-approved design direction (C0):** pursue a new versioned raw race format, preserving legacy v1 unchanged. This is not approval of exact fields or collection. **Proposed design:** See ADR-012. Use one ordered accepted-reference record as both Wvmg update and tack-angle evidence, rather than duplicate streams. Associate each GPS sample with the accepted reference effective **at its GPS timestamp**, with no future-reference look-ahead. Use source timestamps and the proposed shared publication/sample order for ties in ADR-010; never retroactively rewrite emitted samples. Keep tactical-history observations distinct from Wvmg history: propose sampling last displayed tactical estimate on the existing recording schedule, with an availability state, plus bounded lifecycle transitions. Evaluate whether this cadence actually preserves meaningful shifts before selecting it. It is not approved to record every native motion sample.

To reproduce displayed availability, also represent a minimized VMG eligibility state/reason. Raw-v1 omits local computed VMG and wind quality metadata; removing a sample wind would cause backend fallback to course wind, not encode unavailable. Merely changing per-sample wind therefore cannot prove full app/backend parity. Consider the v1 field for effective Wvmg only after semantic review; prefer explicit lineage/quality in a new raw version for complete history. Keep W0 capture metadata separate from derived acceptance evidence.

**Acceptance D6:** Golden fixtures containing multiple calibrations yield identical app/logger/new-backend effective wind and VMG for eligible sample timestamps, and matching unavailable intervals under the approved gating policy. A late GPS timestamp uses the previous reference; same-time ordering is deterministic. Tactical shifts between accepted references remain distinguishable. Export includes the approved new history; race/account deletion inventories cover it and derived results. Old raw-v1 fixtures still validate and retain their old meaning; old immutable gzip/digest/result bytes are unchanged. Extra event fields still fail old v1 validation. Expanded/compressed/event/sample limits are enforced without silent truncation.

### D7 — Phone-to-bow start geometry

**Decided:** Configurable centerline phone-to-bow distance in meters, allowing zero; orient offset with fresh reliable true-north HDG, retain GPS SOG/COG projection and line/GPS validity checks. No DTL display or accuracy promise.

**Proposed design:** Pure bow-position transform feeding `calculateStartMetrics`, using the same local metric plane as the existing ray/finite-segment intersection. East/north offset is `d*(sin(HDG),cos(HDG))`; translate the phone position or line coordinates consistently. Offset the origin before testing finite-segment intersection, not merely subtracting d from ray distance. Keep actual recorded GPS coordinates as phone coordinates. **Owner-approved range: 0–15 m**, replacing the former 0–30 m proposal. A local setting in Setup, 0.1 m entry precision and default zero remain **proposed** UI/storage choices; reject invalid input rather than silently using a different geometry. Placement/persistence remain G2 review choices.

**Owner-approved G2:** if reliable, current true-north HDG is unavailable, **both TTL and BURN display `—`**, even if d=0. Do not substitute stale heading or GPS COG. With valid HDG and d=0, retain unchanged time-to-line geometry. Confirm prestart heading availability and existing GPS/line/COG gates in implementation. A/B capture when HDG is unavailable is a separate unresolved G2 decision. Product/UI must approve this fallback. **Owner-approved A/B capture semantics:** instruct the sailor to tap A or B **when the bow reaches the physical mark**. Save the estimated mark location from **phone GPS plus the configured phone-to-bow offset oriented by fresh reliable HDG at the capture timestamp** (at zero distance, unchanged GPS). These new A/B points must not be corrected again in line intersection or when the setting later changes. Legacy stored endpoints keep their original meaning and must not be silently migrated. Missing/poor HDG capture policy, provenance and recapture rules remain G2 design questions.

**Contract/dependency:** Live-only setting and ephemeral bow transform need no cloud field. Reproducing corrected historical crossing would require captured d/HDG quality/time and a versioned start-analysis method; D7 does not approve this extra persistence. Keep backend phone-track crossing clearly distinct until reviewed.

**Acceptance D7:** Capturing A/B with bow positioned at the mark applies the forward correction **once**, with correct provenance and unchanged legacy endpoints. Changing distance after capture never alters already saved coordinates; recapture is explicitly handled. GPS/HDG timing and invalid-quality behavior have reviewed test cases. Zero gives identical existing TTL/BURN/status results. For a line 20 m north, phone moving north at 2 m/s, HDG north and d=4 m, TTL is 8 s rather than 10 s; BURN increases by 2 s for the same countdown. With COG north and HDG east the offset is east, never north. Oblique ray cases test intersection moving inside/outside the A/B segment. Parallel/away rays, already-beyond-line, coincident endpoints, invalid distance, bad GPS/line and stale HDG fail under their reviewed rules. Test near-bow mounting and 359°/1° headings. No GPS uncertainty is reduced by this transform.

### D8 — Calibrated R/S restored in Sailing

**Decided:** R upper left and S upper right, flanking FART above its number; small secondary R/S labels beside signed degrees; no boxes/backgrounds; reuse existing gravity axes, sign and session zero. No recording/persistence/cloud change.

**Proposed design:** Pass the same `calculateRollPitchRelativeToCalibration` result already used by Setup from AppShell to Sailing. Render null as the established placeholder; do not display raw uncalibrated angles as calibrated. Reserve a compact row above the speed number and use existing typography. Share the existing motion manager; add no native stream or new calibration workflow.

**Contract/dependency:** UI-only, independent of ADR-010/012. Review the missing/uncalibrated presentation; retain runtime-only zero after app restart.

**Acceptance D8:** One Setup zero produces matching signed R/S in both views. Starboard-rises and bow-rises signs match the existing native mapping; yaw alone does not materially change values. Missing/uncalibrated inputs show placeholders. Screenshot/layout checks at supported narrow/wide iPhone sizes, safe areas and large text show no overlap with speed/dots/tabs; speed remains dominant, no rectangles or fills. Payload/export snapshots contain no new R/S fields. Actual mounted-iPhone validation is required; the source mockup itself is not present in the repository, so visual comparison with the owner's original remains pending.

### D9 — Wind-based start-line advantage in Course

**Decided:** With A/B and usable initial Course wind, show favored A/B endpoint and angular bias; square is neutral, missing data produces no invented advantage. Recompute for endpoint/wind edits, use wind-FROM W0, retain TTL/BURN presentation.

**Proposed design:** In a local east/north plane let L=B−A and U=(sin W0,cos W0). `p=dot(L,U)`: positive favors B, negative favors A. Bias magnitude is `asin(clamp(abs(p)/length(L),0,1))` in degrees (0° square, 90° parallel to wind). Reject degenerate/nonfinite/unsupported geometry. Use UI A/B identities; internal `port/starboard` storage names are not proof of physical endpoint roles. The owner **approved neutral at <=2° and whole-degree display otherwise**. Include GPS-quality caveats consistent with Course; review poor-line behavior and placement under G2; do not silently claim angular accuracy from rounding.

**Contract/dependency:** Derived prestart UI needs no new API field if A/B coordinate semantics are explicit. The newly approved corrected A/B point captures require a provenance/legacy-compatibility review even without a schema change. Reconcile the contradictory canonical product sentence in this documentation PR; do not revive K1/L1.

**Acceptance D9:** With wind FROM north, an east-west line is neutral; moving B north favors B, and swapping A/B swaps the label while preserving magnitude. A line tilted 6° from east-west reports 6° and the correct upwind end. Changing W0/endpoints recomputes; changing Wvmg cannot affect Course advantage. Missing/invalid/unapproved wind, missing endpoints and zero-length line produce unavailable, not a favored end. 0°/360° wind is equivalent. Verify rounding/neutral boundaries and poor accuracy messaging; TTL/BURN output remains unchanged by D9.

### D10 — Web tack and gybe analysis

**Decided:** Identify/distinguish maneuvers when quality permits; show time/location, minimum speed, reduction/recovery, comparisons; investigate performance loss without equating speed dip to verified distance loss. Assess five-second sampling and historical limits before requesting richer logging.

**Owner-approved next investigation (C0):** run only C13's isolated synthetic 1-second truth versus 5-second downsampling study; metric/confidence approval remains deferred. **Proposed design:** Offline synthetic feasibility first, then a deterministic backend module with its own new analysis identity after contract approval. Search reliable COG legs for persistent wind-relative side changes: crossing wind-FROM axis while upwind suggests tack; crossing downwind axis suggests gybe. Require stable before/after windows, hysteresis and maximum-gap checks. Use HDG only where actually recorded with adequate provenance; current AppShell recording does not send it, despite the optional raw field. Reject GPS jumps, low-speed course noise, wind-reference step artifacts and gaps as uncertain/unclassified. Do not derive maneuver counts from legacy K1 layline events.

Proposed metric definitions: baseline is median reliable speed in a stable pre-maneuver window; minimum is the **observed sampled minimum**, reduction is baseline minus minimum (kn and percentage with positive baseline); recovery is first sustained interval returning to a reviewed fraction of baseline. Missing observation horizon is incomplete recovery, never zero time. Candidate windows of 20 s before/after, recovery >=95% for 10 s and no gaps >10 s are experiment parameters only. At five-second cadence a short true minimum can be missed and maneuver time is interval-bounded; interpolation is not additional evidence. Compare like maneuver types and comparable approach speeds/conditions.

For exploratory speed-deficit area, integrate `max(0,vbaseline−v(t)) dt` with knots converted to m/s. Name it modeled speed-deficit distance under a stated baseline, not verified position/progress loss. VMG/progress loss additionally needs stable compatible wind/course reference and a justified counterfactual; withhold across reference jumps/unsupported course context. Exact metric set, classifications, confidence labels and coaching visuals require G4 approval. Web should consume versioned results through the existing owner API seam, use replay timestamps/source indices for selection, and clear data on race/account/logout changes. No public/team/coach access is added.

**Contract/dependency:** Existing strict result/summary/detail v1 cannot accept a maneuver array or new algorithm identifier. New schema/version support is required across contracts, API validators/completion/projection, and web parsers. No automatic reanalysis, new logging rate, sensor persistence, migration or deployment is authorized.

**Acceptance D10:** Labelled synthetic tack, gybe, ordinary steering and noisy low-speed traces produce expected classification or explicit uncertainty; inject wind jumps, missing HDG, duplicate timestamps, 5/10/20 s gaps and missing recovery. Downsample known 1 s synthetic truth to 5 s and report timing/minimum/recovery error and false positives; do not claim more precision than observed. Metric fixtures verify units, baseline, null/uncertain outcomes and comparison filters. Historical races with only GPS/COG remain readable with unavailable unsupported metrics. Same raw bytes/version give deterministic results. Cross-owner requests fail without data, late account-switch responses are discarded, and no new payload/key/token/GPS logs or browser persistence appear.


## C0 owner dispositions (2026-11-26)

Product approval, not ADR acceptance: (1) alpha is manually set/edited by the sailor, with feedback only; every new calculation reads its current value and an accepted Wvmg stays frozen until the next approved calibration; recovery/snapshot interactions remain open (G1). (2) Phone-to-bow distance is limited to 0–15 m; the sailor taps A/B when the **bow** is at the mark and new A/B coordinates are corrected **once at capture** (G2). Existing/historical points must not be silently reinterpreted; use true-north HDG at the same capture event and design the A/B capture fallback. For TTL/BURN, show `—` if current true-north HDG is missing, **including with zero bow offset**, without COG fallback. (3) Start-line bias neutral threshold <=2°, with whole-degree reporting and GPS-quality messaging (G2). (4) Proceed with a new versioned raw-data **design**, not approved collection or contract (G3). (5) Run C13 with **synthetic data only** to investigate current five-second feasibility; G4 remains deferred.

This update must not promote ADR-010, ADR-011 or ADR-012 from PROPOSED to accepted. Each still requires the relevant follow-up architecture/security/privacy and, where needed, further product review.

## Approval register

| Gate | Explicit decision still required | Approval and evidence |
| --- | --- | --- |
| G1 | **Approved:** read current user alpha for every new calculation, accepted Wvmg remains frozen until next accepted reference. **Open:** consistent pending sampling windows, derived-reference recovery, post-gun Course mismatch, background/Continue/corruption and local owner binding | Architecture; product where fallback changes visible behavior; security/privacy for persistence. ADR-010 plus race/recovery fixtures and native lifecycle evidence. |
| G2 | **Approved:** 0–15 m, one-time bow-at-mark A/B correction, bias neutral <=2°/whole degrees, **TTL and BURN `—` without fresh HDG (including d=0)**. **Open:** setting default/storage/UI, missing-HDG behavior specifically for A/B capture, legacy endpoint provenance, recapture, poor-line policy and R/S placeholders/layout | Product/UI and architecture review of ADR-011; native geometry/attitude evidence. No GPS accuracy or legal-start guarantee. |
| G3 | **Approved direction:** new versioned raw format while preserving v1. **Open:** exact schema/lineage, tactical-history cadence/bounds, per-sample eligibility, local/export format, retention/deletion/backup handling and resource limits; no new collection authorized | Contracts + architecture + security/privacy owner review, CRA risk/evidence update, GDPR inventory/processing/notice assessment before collection. Exact retention and lawful-basis/notice changes remain unresolved; no legal-compliance claim. |
| G4 | **C13 synthetic feasibility approved**; confidence/Settings placement, maneuver windows/classification, speed/recovery/loss definitions and web result/UI/version design remain unapproved pending evidence | Product + architecture; security/privacy for expanded derived personal data; synthetic feasibility and physical/on-water evidence. |
| G5 | Any implementation, cloud migrations, reanalysis or release/activation | Separately scoped owner-authorized tasks after relevant gates; existing ADR-003–008/AGENTS release requirements still apply. This PR authorizes none. |

## Data-contract impact map

| Surface | Consequence and safe compatibility rule |
| --- | --- |
| Local Race/logger/recovery/export | New derived-reference/history needs explicit local version, migration/unknown-version handling, export and deletion design. Do not insert new event kinds into the existing `LaylineTackEvent` union without review. |
| Raw-race-v1 | `additionalProperties:false`; optional sample wind/heading does not grant permission to start new collection. No general history, alpha-at-acceptance or VMG quality state. Keep existing immutable artifacts and snapshots unchanged. |
| Proposed raw-v2 | Owner-approved direction is a new versioned format (not yet an approved schema); candidate W0 provenance, shared accepted-reference table, bounded tactical snapshots and sample lineage/eligibility; exact fields/limits unresolved. Audit all prepare/content/finalize validators, reservation/version storage and readers before adopting. No endpoint/schema edit in this PR. |
| Analysis identity | Change result-affecting calculations under a new `analysisVersion`, independently from raw/result/API versions. Support old results alongside new; never retarget historical required versions automatically. |
| Stored result/summary | New maneuver/history detail requires new reviewed shape/version and deterministic canonical bytes. Summary stays bounded, no coordinates/track timestamps/history arrays/internal keys. Preserve 16 MiB result and 16 KiB summary constraints unless separately reviewed. |
| Owner detail/browser | Versioned projection excludes source/internal keys/digests; strict old clients keep old responses or explicit unsupported-version handling. Keep private no-store owner authorization, memory-only lifecycle and session-generation checks. |
| D7/D8/D9 | No new cloud contract is necessary for live geometry/R/S/prestart bias. Persisting bow/HDG history or R/S is not implicitly approved. |

Prefer a single new raw format over a separately uploaded sidecar for D6: sidecars add acceptance identities and cross-store deletion/recovery obligations. Alternative: reviewed v1 per-sample wind semantics can deliver limited numeric reference parity, but cannot alone satisfy the full explainability/quality requirement. Record the final tradeoff in ADR-012 before any writer change.

## Security/privacy/CRA design consequences

Accepted headings, calibration timestamps, tactical history and maneuver locations are personal race data, including derived/inferred data. Minimize to aggregates/source indices where sufficient; avoid duplicating coordinates on every reference. Do not collect native motion matrices, magnetometer streams, R/S, identities or debug data to solve this feature. No new sensor/network/provider dependency while racing.

Extend the existing race/account deletion and portable export inventory to local checkpoints, new raw history and all derived result versions. Propose the same race-bound lifecycle rather than independent indefinite retention; exact local/backup periods and history bounds need G3. Browser detail remains in memory only and cleared on closure/logout/account change. Private R2 and strict authenticated per-owner checks apply to every version and service-role operation; no permanent credentials or internal keys reach clients. Any future public-schema Data API object needs explicit least-privilege GRANT/REVOKE in the same migration.

Threat review must cover replayed/forged acceptance evidence, nonfinite/oversized/out-of-order history, unsupported versions, reference jumps causing false maneuvers, stale session responses, unbounded pair searches and expanded result cost. Treat input as untrusted; use bounded streaming/linear passes where possible. Measure worst-case 50,000-sample analysis and history/result limits under the actual runtime before release. Existing deletion/fencing/restore gaps and ADR-007 status remain open; new data cannot bypass them. No repeated live provider checks or production data reads are needed for this design.

## Verification and evidence plan

1. Synthetic deterministic TypeScript fixtures: circular angles, reference acceptance/rejection, frozen Wvmg, event/sample ordering, restart and account boundaries, geometry and bias. Reuse existing tests, add behavior cases that expose the new risks.
2. Contract integration: old/new version fixtures and negative extra-field/limit tests across app projection, API validation, deterministic analysis and strict browser parsing. Assert old gzip hashes/canonical result bytes stay unchanged; verify export/delete inventory and no telemetry logs.
3. UI/browser: baseline comparison for D4; R/S safe areas/text scaling and Course/Settings states; web uncertainty/replay/session invalidation with synthetic data. UI tests do not certify native sensors.
4. Real Xcode simulator Build and Run in the same worktree as build/sync; actual mast-mounted iPhone north/roll/pitch/waves, GPS/HDG loss, background/foreground/recovery/concurrent wind-capture tests. Retain ADR-008's existing three-second HDG filter.
5. Owner-authorized on-water trials: independently referenced headings, both tacks and gybes, known mounting distances and oblique start approaches; record non-identifying outcomes and errors rather than tracks in public evidence. Agree error/confidence thresholds before trials; record exact build/commit and pass/fail. No native/on-water success is claimed by this documentation PR.

Small dependency-ordered tasks and stop conditions are in the [Codex task plan](race-performance-codex-plan.md).
