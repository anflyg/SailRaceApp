# Race performance — change decisions (working document)

**Owner-approved product direction:** 2026-11-26.  
**Document status:** Draft PR; decisions below are approved at product level but **not implemented, technically approved, or released**. This file is a working register to extend with later explicitly approved decisions before review/merge.  
**Scope:** TackWise Race live VMG, wind-shift instruments, tack-angle feedback, start geometry and calibrated attitude display, with later race analysis. Watch and unrelated product areas remain outside this draft.

## Decision 1 — Separate the three wind references

Keep distinct values with distinct purposes:

- **Initial wind (W0):** the existing approved true-north wind capture before the start. Use it as the first live wind-VMG reference. Preserve W0 as the fixed origin of the wind-shift scale throughout the race.
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

The only new wind-calibration-related presentation is **post-race tack-angle feedback in Settings and Analysis**. No live wind/VMG badges, labels, extra VMG values, or new wind controls are approved. The separate owner decision below to restore **R/S (roll/pitch)** to Sailing is an explicit, independent addition whose placement remains to be specified by the owner.

## Decision 5 — Offline behavior and fallback

- The first Wvmg is the valid initial W0 until the first accepted stable-tack recalibration.
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

**Not approved yet:** a new distance-to-line (DTL) display or a start-line bias/advantaged-end feature. Discuss these separately before any product scope decision.

## Decision 8 — Restore calibrated roll and pitch on the Sailing screen (2026-11-26)

**Approved product behavior:** Display existing calibrated `R` (rullning/roll) and `S` (stampning/pitch) **again in Segling/Sailing**. Reuse the sensor/calibration values already available in Setup (Core Motion gravity-axis mapping and existing session zero calibration). Do **not** create a different sensor concept.

- The owner will specify the **exact location and presentation** in detail; **do not design, implement, or assume placement** before that input.
- Preserve the current dominant FART / RIKTNING / VMG display and existing wind-shift cues. The addition of R/S is separate from Decision 4's **no changes to wind/VMG presentation**.
- No new recording, persistence, cloud telemetry or API contract changes for R/S are authorized by this decision. Behavior for uncalibrated/missing values and native verification require design.

## Topics reviewed but not approved for implementation (2026-11-26)

- **Start-line bias (linjefördel):** needs an explanation and a separate owner decision. Not part of the bow-offset approval.
- **Tack/gybe performance-loss analysis:** needs an explanation and a separate owner decision; high-rate data may be prerequisite.
- **Additional speed statistics/live performance indicators:** owner does not see a need; not in current scope.
- **Import from third-party sailing instruments:** deferred.
- **Dedicated hardware and RaceSense-like regatta integrations:** no action.

## Further approved decisions

Append subsequent **owner-approved decisions** here with date, a concise scope statement, intended behavior, and any remaining implementation/approval dependencies. Mark proposals separately; do not silently promote draft ideas to decisions. Reuse this draft PR/branch for these follow-ups rather than opening competing PRs. Keep unrelated implementation tasks outside this documentation-only PR.
