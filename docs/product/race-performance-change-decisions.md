# Race performance — change decisions (working document)

**Owner-approved product direction:** 2026-11-26.  
**Document status:** Draft PR; decisions below are approved at product level but **not implemented, technically approved, or released**. This file is a working register to extend with later explicitly approved decisions before review/merge.  
**Scope:** TackWise Race live VMG, wind-shift instruments, tack-angle feedback, start geometry and start-line bias, calibrated attitude display, and later race analysis including tacks and gybes. Watch and unrelated product areas remain outside this draft.

## Decision 1 — Separate the three wind references

Keep distinct values with distinct purposes:

- **Initial wind (W0):** the first race-bound approved true-north wind capture, normally before the start. **If none was approved by the gun, the first valid Course wind measurement afterward may establish W0 once** (Decision 11). Use W0 as the first live wind-VMG reference and preserve it as the fixed origin of the wind-shift scale after establishment.
- **Tactical wind-shift estimate (Wtactical):** retain the existing continuously updated HDG/tack/half-tack-angle estimate for the six red/green lift/header indicators and the green wind-shift scale marker. This estimate is not directly fed to VMG. Keep all current instrument presentation, colors, gates, thresholds, and behavior unchanged.
- **Accepted VMG wind (Wvmg):** initialize to W0, then replace only at successful stable-tack reference establishment. Hold its most recently accepted value until the next successful calibration. Normal steering corrections between calibrations must not move Wvmg.

Live VMG continues to use reliable **GPS SOG and COG**, not boat HDG, in `SOG_knots * cos(COG - Wvmg)`. Keep the existing GPS freshness/reliability guards and unavailable behavior. Initial wind must still pass the existing native true-north/quality gate.

## Decision 2 — One stable tack is sufficient to recalibrate VMG wind

Use the **existing** post-gun, upwind-only stable-tack acquisition; do not introduce a two-tack prerequisite for VMG.

1. On the first eligible stable upwind tack after the start gun, or after a subsequently confirmed tack, use the existing 5-second tack identification and 30-second reference-establishment process.
2. Seconds 0–20 allow the boat to settle; during seconds 20–30 collect filtered true-north HDG and form the accepted circular mean for that tack. Reuse existing stability/reference checks; exact future tolerances may be refined through tests.
3. At successful acceptance, calculate the **new Wvmg** using the locked mean heading and half of the user's configured full tack angle (alpha):
   - Starboard: `normalize(meanHDG + alpha / 2)`.
   - Port: `normalize(meanHDG - alpha / 2)`.
4. Freeze that Wvmg until the next eligible stable-tack reference is successfully accepted. Rejecting a reference, tacking, reaching/downwind sailing, or losing HDG must **not** rewrite Wvmg.
5. Keep W0 and the tactical wind-shift estimator separate. Do not alter the current red/green dots or green scale marker to follow Wvmg.

This is a **course-derived estimate**, not an independently measured instantaneous wind direction. Errors from inconsistent sailing angle, compass bias, leeway, or wind changes during sampling remain possible and require on-water verification.

## Decision 3 — Use two tacks for tack-angle feedback, not as a VMG gate

After sailing, compare **accepted stable heading references** from starboard and port under reasonably comparable conditions. Use their circular separation to estimate the observed **full tack angle** and compare it with the user's configured alpha.

- Prefer two references taken within **five minutes** of one another. Require comparable sailing conditions (especially stable heading and reasonably similar speed), and account for wind shifts between tacks; if not comparable, do not produce a confident recommendation.
- Prefer repeated consistent observations rather than a single pair before recommending any change.
- Show the observed tack angle and a **non-binding adjustment suggestion** in **Settings after sailing** and in **TackWise Analysis**.
- **Never automatically change** the user's configured tack angle.
- This feature is not required to recalibrate Wvmg from a single accepted tack.

The exact confidence criteria, treatment of wind shifts between the two legs, and placement of post-race Settings feedback need technical/UI design.

## Decision 4 — No changes to the live wind/VMG presentation

Retain the existing **wind/VMG instrumentation and presentation** in Sailing: main FART/RIKTNING/VMG figures, six lift/header dots, wind-shift scale, captions, colors and wind-specific interactions. The VMG decision changes only the **underlying wind-reference calculation**, not the way VMG or wind shifts are shown.

The only new wind-calibration-related presentation is **post-race tack-angle feedback in Settings and Analysis**. No live wind/VMG badges, labels, extra VMG values, or new wind controls are approved. The separate owner decision below to restore **R/S (roll/pitch)** to Sailing is an explicit, independent addition. Its placement and style were specified by the owner on 2026-11-26.

## Decision 5 — Offline behavior and fallback

- The first Wvmg is the valid initial W0 until the first accepted stable-tack recalibration. If no usable W0 exists at the gun, VMG is unavailable **until the first approved post-gun Course measurement establishes the race origin**, as defined in Decision 11.
- Retain the last accepted Wvmg if no new stable calibration can be made, including on reaching/downwind legs, during tacks, or while sensor quality is insufficient for recalibration.
- Continue withholding the live VMG value when the existing GPS/COG/wind-reference quality gates fail; retaining the wind reference must not bypass sensor-quality checks.
- Race-critical calculation must remain offline-first, with no new external sensor, cloud dependency, or network access while sailing.
- Preserve the existing prestart/post-gun race wind snapshot and account/session boundaries. Recovery/resumption behavior for the *new derived Wvmg state* must be explicitly designed and tested.

## Decision 6 — Preserve wind and calibration history for analysis

Analysis should be able to explain **how the wind direction evolved**, which wind reference underpinned displayed VMG, and how observed tack angles were calculated.

Intended observations include:

- W0 and a timestamped history of **accepted Wvmg recalibrations** (heading, tack, quality/evidence).
- Sufficient, minimized observations of tactical wind-shift evolution for meaningful post-race analysis; accepted Wvmg history alone is **not** equivalent to the continuously displayed green wind-shift marker.
- The accepted stable per-tack heading means and relevant quality/time information needed for post-race tack-angle comparison.
- The wind direction used for each recorded GPS sample's VMG, so app and web analysis use the **same** reference rather than silently disagreeing.

**Existing contract facts (not new approval):** `raw-race-v1` already has `course.windDirectionDegrees` and optional per-sample `windDirectionDegrees`; the analysis backend prefers the per-sample wind when recomputing VMG. Today the app records the initial wind per sample. A future implementation can evaluate representing Wvmg in that field, but its semantic compatibility and lineage must be reviewed. The existing raw-v1 schema has no general calibration/wind-shift events. Do **not** assume additional event fields or telemetry can be added to the v1 payload without explicit contract versioning/review.

## Implementation and approval boundaries — not yet decided

These are **technical follow-up questions**, not additional product approvals:

1. Establish robust quality gates and explicit rejection reasons for Wvmg recalibration; validate references across 0/360 degrees, missing/expired sensors, tack transitions, outliers and adverse sea conditions.
2. Specify how to compare two tacks when wind may have shifted between them, confidence/speed thresholds, the rolling evidence window, and when to show a suggestion.
3. Define minimal local state and race recovery behavior for Wvmg, including tab changes, backgrounding and a new race.
4. Design and review raw/analysis storage and versioning for wind and tack-angle history, historical race compatibility, privacy inventory, retention, deletion, and upload size constraints. GPS and race telemetry are personal data.
5. Align iPhone-recorded and backend-recomputed VMG, including current differences in quality gating. Existing immutable cloud artifacts must not be rewritten.
6. Require relevant TypeScript/unit, integration/contract, native iPhone/Core Motion and on-water acceptance evidence before shipping. A documentation PR alone does not authorize implementation, merge, or production activation.

## Reference implementation and governing documents

- `docs/product/tackwise-race.md` — existing accepted product behavior; unchanged in this draft.
- `docs/sensors.md` and `docs/architecture/decisions/adr-008-core-motion-wind-reference.md` — Core Motion wind/HDG and pending physical validation.
- `src/domain/windShiftInstrument.ts` — current tack state machine and wind estimate.
- `src/features/race/RaceDashboardView.tsx` — currently computes live VMG against initial course wind.
- `src/services/raceLogger.ts` — currently records initial wind on samples.
- `anflyg/tackwise-contracts/schemas/raw-race-v1.schema.json` and `anflyg/tackwise-api/src/analysis-v1/analyze.ts` — existing raw format and backend VMG computation.
- `AGENTS.md` and relevant security/privacy docs — mandatory before implementation.

## Decision 7 — Correct start geometry for the distance from iPhone to bow (2026-11-26)

**Approved product behavior:** Add a configurable distance, in meters, between the iPhone's mast-mounted location and the boat's bow. Apply this to the **bow position used for start-line calculations**, including the existing time-to-line (TTL) and therefore BURN. Do not merely display the distance; make it affect the underlying calculations.

- The GPS location is the **phone's**, not automatically the bow's. For the assumed centerline mast mount, calculate the estimated bow position by offsetting the phone's position forward by the configured distance along the boat's **fresh, reliable true-north HDG**. Do not use GPS COG to orient the bow offset; HDG and COG can differ.
- Continue using GPS-based SOG and COG for projected motion towards the line, as today; only the **geometric position origin** changes. Preserve the current validity checks for the start line and GPS.
- Allow a zero distance (no correction) and avoid requiring any additional hardware or network service. Exact settings placement, persistence, validation range, and what the UI says when HDG is unavailable are implementation/design follow-ups.
- This removes a known mounting-position offset but **does not improve GPS coordinate accuracy**. The user noted roughly 3 m GPS uncertainty as an illustration, not a guaranteed or fixed device error; the start-point/committee-end GPS positions may also be uncertain. Avoid any promise of centimeter accuracy or guaranteed legal starts.
- Consider both crossing/intersection geometry and time-to-line/BURN for regression tests, including courses oblique to the line, phone mounted close to the bow and unavailable heading.

**Not approved yet:** a new distance-to-line (DTL) display. Start-line bias is now independently approved by Decision 9 below.

## Decision 8 — Restore calibrated roll and pitch on the Sailing screen (2026-11-26)

**Approved product behavior:** Display existing calibrated `R` (rullning/roll) and `S` (stampning/pitch) **again in Segling/Sailing**. Reuse the sensor/calibration values already available in Setup (Core Motion gravity-axis mapping and existing session zero calibration). Do **not** create a different sensor concept.

- **Placement (owner-provided Sailing mockup):** position **R** in the **upper-left** and **S** in the **upper-right** of the Sailing content, flanking the large speed/FART display, above its main numeric value. The submitted screenshot specifies the positions **only**, not a requirement for the outlined rectangles drawn in the mockup.
- **Style:** show **small secondary labels R and S beside the numerical values**, e.g. `R -6°` on the left and `S 18°` on the right. **No boxes, borders, cards, or filled backgrounds**; plain numbers with small R/S labels. Keep the speed number visually dominant.
- Avoid overlaps with speed digits, wind-shift dots, tab bar, and display safe areas at supported phone widths. Verify layout against the supplied reference screenshot; no claim that the layout is collision-free before implementation/testing.
- Reuse existing Core Motion/gravity-derived R/S values and the zero calibration currently available in Setup, including current sign conventions. No new roll/pitch computation or recalibration workflow is authorized.
- Preserve existing wind/VMG presentation per Decision 4; R/S restoration is a separate, explicitly approved addition.
- No new R/S recording, persistence, cloud telemetry or API contract changes are authorized. Missing/uncalibrated-value handling and native validation are implementation details.

## Decision 9 — Show wind-based start-line advantage in Course (2026-11-26)

**Approved product behavior:** On the **Bana/Course** page, once **both start-line endpoints A and B** have been recorded and the initial wind direction has been measured and approved, display the **wind-based start-line advantage** (`Startfördel`).

- Determine which A/B endpoint is farther **upwind** according to the recorded line geometry and wind-FROM direction. Display **both** the favored endpoint **and** the angular bias in **degrees**, relative to a line perpendicular to the wind.
- Use the existing **A/B labels** of the Course UI, rather than assuming A is the port end or B the starboard end. Example Swedish presentation: **`Startfördel: B-änden gynnad, 6°`** (illustrative, not a measured result).
- For a sufficiently square line, present a neutral result rather than choosing a favored end. Exact neutral tolerance, rounding and placement within Course remain technical/UI details.
- Until both endpoints and a reliable, compatible initial wind reference exist, show no invented advantage. Recalculate if either endpoint or the measured wind changes; avoid misleading precision given GPS uncertainty.
- Use the original Course wind measurement, **not** a mutable in-race VMG wind estimate, for this prestart result. Do not mix line geometry with an unsupported tactical recommendation incorporating current, traffic or preferred course side.
- Keep current TTL/BURN presentation unchanged as part of this feature.

This decision **supersedes** the older `docs/product/tackwise-race.md` wording that no replacement start-line advantage algorithm is introduced. Reconcile the canonical product document before implementing.

## Decision 10 — Analyze tacks and gybes in TackWise Analysis (2026-11-26)

**Approved product direction:** Add **post-race tack and gybe analysis to TackWise Analysis (web)**, not to the live Sailing display.

- Identify and distinguish tacks and gybes in recorded races when the data quality permits; report maneuver timing/location and avoid false certainty where the input does not support a conclusion.
- Analyze **minimum speed, speed reduction and recovery**, and investigate a meaningful definition of **performance loss** relative to an appropriate baseline. Evaluate progress/VMG loss only if the recorded wind and course references support it. Do not equate a temporary speed drop with a verified distance loss.
- Enable comparison of multiple maneuvers within a race for coaching and improvement. Exact scores, metrics, visuals, thresholds and quality requirements remain open for design.
- First assess the current **five-second normal GPS recording interval**, current availability of HDG/COG, and historical data limitations. Any increase in logging rate, new sensor persistence, changes to API contracts or cloud processing require a separate design and privacy/security/CRA/GDPR review plus owner approval.
- Preserve existing historical race support and strict per-owner race data access. This decision does **not** approve implementation, deployment or data migration.

This web feature will likely be implemented in `anflyg/TackWiseAnalysis` with related changes scoped in the owning repositories after technical review; record only the product decision here in `SailRaceApp`.

## Topics reviewed but not approved for implementation (2026-11-26)
- **Additional speed statistics/live performance indicators:** owner does not see a need; not in current scope.
- **Import from third-party sailing instruments:** deferred.
- **Dedicated hardware and RaceSense-like regatta integrations:** no action.

## Proposed technical follow-up

Technical follow-up documentation (all **proposed**, no additional product approval): [technical design and D1–D10 acceptance criteria](../architecture/race-performance-technical-design.md), [ADR-010](../architecture/decisions/adr-010-vmg-wind-reference-lifecycle.md), [ADR-011](../architecture/decisions/adr-011-bow-origin-and-start-line-bias.md), [ADR-012](../architecture/decisions/adr-012-wind-history-and-maneuver-analysis.md), and the [dependency-ordered Codex task plan](../architecture/race-performance-codex-plan.md). The canonical Race/Analysis documents now distinguish this approved planned direction from existing implementation; no technical proposal is promoted to an approved product decision.

## C0 — owner clarifications and dispositions (2026-11-26)

The following are **explicit product-level confirmations** to decisions D1–D10, not approval of ADR-010/011/012, API contracts, new data collection or production implementation.

| Topic | Owner-approved position | Still requiring separate design/approval |
| --- | --- | --- |
| D3 / G1 — `Slagvinkel` (`alpha`) | **The sailor always sets alpha manually.** Every new angle-dependent calculation uses the **currently configured alpha**, including when changed during a race; post-race advice never changes the setting. **An already accepted Wvmg remains frozen until the next approved stable reference**, which uses the then-current alpha; no retroactive recalculation. | How the running 20–30 s acquisition is safely restarted/revalidated if alpha changes mid-window, and recovery/snapshot/owner lifecycle details, remain technical G1 work. |
| D7 / G2 — distance setting | Allowed configurable phone-to-bow distance: **0–15 meters**. | Default, entry step, persistence, setting location, error handling and native validation. The earlier 0–30 m range is superseded; 0.1 m precision remains only a proposal. |
| D7 / G2 — TTL/BURN on HDG loss | **When there is no current, reliable true-north HDG, show `—` for both TTL and BURN.** Do not silently substitute GPS COG or stale HDG; this applies even if the configured bow distance is zero. | Exact freshness wording/indicator and heading availability across Course/Start require technical verification. The separate fallback for **A/B capture** during HDG loss remains open for review. |
| D7 / G2 — A/B endpoint capture | **User instruction: tap A or B when the boat's BOW is at the corresponding physical start mark.** At that moment, use phone GPS position plus the configured forward phone-to-bow offset oriented with reliable true-north HDG to save the **estimated physical mark position**. Apply the same physical bow correction to live TTL/BURN geometry. | Exact missing/stale-HDG capture behavior and quality UI. Capture provenance, stored-coordinate compatibility, recapture policy and local/cloud implications need C2 review. Do not silently re-offset previously stored A/B coordinates or historical races, and do not apply the bow offset twice. Raw GPS track positions continue to represent the phone. |
| D9 / G2 — wind-based line bias | Use the proposed geometry, **neutral when bias <=2°**, and display non-neutral magnitude in **whole degrees**. Communicate poor A/B GPS accuracy instead of claiming angular precision. | Exact poor-quality suppress/warn rules, message, responsive UI and verification. |
| D6 / G3 — wind/calibration history | Proceed with the **preferred design of a new versioned raw race format**, retaining strict legacy v1 compatibility rather than silently reinterpreting v1 fields. | Exact fields/cadence/version identifiers, export, retention, deletion, security, privacy, CRA, GDPR and contracts still require formal review. This is **not permission to collect or upload new telemetry**. |
| D3/D10 / G4 — feasibility | **C13 synthetic-only feasibility study approved as the next investigation**, comparing known 1-second truth to current 5-second sampling and checking tack-angle/wind-shift confounding. | Do **not** approve confidence classes, maneuver timing/recovery/loss metrics, higher-rate logging, or G4 until the study's evidence has been reviewed. |

**No architecture/release gate is closed merely by these confirmations.** In particular G1 lifecycle, G2 missing-HDG/coordinate provenance, G3 complete data lifecycle and G4 measured feasibility remain outstanding. Preserve the proposal/accepted distinction in all related ADRs and plans.

## Decision 11 — Allow first approved wind origin after the gun (2026-11-26)

**Owner-approved product behavior:** A race that began **without any usable, approved wind direction** must be able to **activate wind VMG later in that same race**, when a **first reliable true-north wind reference is approved on Bana/Course after the start gun**. The earlier C1 proposal to withhold race-bound VMG for the *entire* race if the gun snapshot lacks wind is **superseded**.

- Until a usable reference is approved, continue showing VMG unavailable (placeholder); do not fabricate wind from GPS COG, compass HDG, or the sailor's configured tack angle alone.
- Once the first post-gun Course wind measurement passes the existing native frame/quality requirements, **bind it once to that race as its W0**, establish initial **Wvmg = W0**, and permit wind VMG from then onward subject to existing reliable GPS SOG/COG, speed and freshness gates. The usual stable upwind tack process may subsequently update Wvmg.
- W0 is the **first valid race-bound origin**, whether approved before or after the gun; once established, preserve the fixed tactical wind-shift scale origin. A later Course wind edit is **not automatically a new W0**. Preserve the prior mismatch/quality protections until the separate post-gun editing policy is reviewed.
- **No retroactive VMG:** GPS observations recorded before the late origin became effective remain uncalibrated/unavailable for wind VMG. Never backfill old samples with the later wind or silently rewrite the original gun-time race snapshot, start timestamp or previously stored immutable artifacts.
- The technical design must explicitly model **a gun-time race snapshot with missing wind and a distinct, later time-stamped race-bound first-origin acceptance**. Verify restart/Continue, other Course edits, account/session boundaries and local/cloud versioning so the late origin cannot leak across races.
- This is a **product approval of late activation**, not approval of a particular persisted event schema, checkpoint strategy, API format, deployment or production enablement. The precise binding/recovery design and its privacy/GDPR/CRA/contract implications remain G1/G3 review items. Keep ADR-010 **PROPOSED** until those reviews.

**Expected acceptance examples:** (1) Gun with no approved wind, valid approved Course measurement afterward => Wvmg initially equals that measurement and VMG can become available with fresh eligible GPS. (2) No approved wind => no VMG. (3) Late failed/magnetic/mock measurement => no activation. (4) Samples before late establishment stay without VMG after recovery/export. (5) Repeating the same accepted origin is idempotent; later incompatible Course measurements do not overwrite it.

## Further approved decisions

Append subsequent **owner-approved decisions** here with date, a concise scope statement, intended behavior, and any remaining implementation/approval dependencies. Mark proposals separately; do not silently promote draft ideas to decisions. Reuse this draft PR/branch for these follow-ups rather than opening competing PRs. Keep unrelated implementation tasks outside this documentation-only PR.
