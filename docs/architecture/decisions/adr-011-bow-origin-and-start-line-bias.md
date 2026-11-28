# ADR-011: Bow-origin start calculations and Course line bias

**Status: PROPOSED — not accepted or implemented.**  
**Date:** 2026-11-26.  
**Product authority:** PR #84 D7/D9.  
**Approvals needed:** G2 in the [technical design](../race-performance-technical-design.md); G3 if any extra telemetry is later requested.

## Context

Current TTL intersects a GPS-COG ray from the phone position with the finite A/B segment, then computes BURN as countdown minus TTL. The phone's mast mount can be behind the bow. COG describes motion over ground, not bow orientation. D9 separately approves a wind-based favored-end display; it does not replace the TTL calculation or revive K1/L1 marks.

## Proposed decision

Apply a pure centerline forward offset to the phone's geometric origin using fresh reliable true-north HDG. In the local east/north plane, bow equals phone plus `d*(sin HDG, cos HDG)`. Keep filtered GPS COG as ray direction and SOG as speed. Re-run the existing finite-segment intersection from that bow origin; subtracting d from TTL distance is wrong when HDG differs from COG or the line is oblique. Retain GPS/line validity and speed checks.

**Owner clarification C0 (2026-11-26): approved range is 0–15 meters**, superseding the earlier 0–30 m proposal. A local-only Setup setting, initial default 0 and 0.1-meter input precision are **still design proposals**; input precision does not imply coordinate accuracy. **Owner-approved G2 fallback (2026-11-26):** when a current, reliable true-north HDG is unavailable, display **`—` for both TTL and BURN**, even at d=0. Do not substitute COG or cached/stale HDG. At d=0, preserve existing numeric geometry when HDG is present, but the display remains gated by HDG availability. This is an explicit change from the prior proposed zero-distance no-HDG fallback. No new UI diagnostic text is required by this product decision. No DTL display is selected.

**A/B capture is now expressly approved for correction at the time of tapping.** In Course, instruct the sailor to tap A or B **when the BOW is at the corresponding physical start mark**. Derive and store the estimated physical mark coordinate from the phone's current GPS position plus `d*(sin HDG, cos HDG)` using a reliable fresh true-north HDG (no HDG requirement when d=0). The live bow position for TTL/BURN uses the same geometric transform at calculation time. This is **not** a request to transform historical A/B coordinates or the underlying phone GPS track. Previously captured points must not be re-offset if the configured distance later changes: recapture or explicit reviewed migration is required. Never apply the offset twice. Capture quality, provenance/storage semantics, A/B recapture guidance and missing-HDG behavior at positive d remain G2 design questions.

Independently compute line advantage from initial approved Course wind-FROM and recorded A/B coordinates. For L=B−A and upwind unit U, dot(L,U) identifies B when positive and A when negative. Angular bias is `asin(abs(dot(L,U))/|L|)` with numerical clamping, unavailable for degenerate/unsupported geometry. The product owner approved **neutral for bias <=2°** and **whole-degree display otherwise** (2026-11-26). Flag poor A/B GPS quality rather than promising angular accuracy; the exact show-versus-withhold handling and wording remain G2 UI/quality design. Never use Wvmg or infer physical port/starboard identity from storage field names.

## Alternatives

- COG-oriented offset: rejected by D7 and physically wrong with leeway/current.
- Scalar distance subtraction: fails finite-segment/oblique geometry.
- Silently re-offset existing/historical A/B coordinates, or shift original recorded GPS tracks: rejected. **New A/B point captures** are corrected once to the physical bow-at-mark position by explicit owner decision; legacy data retains its historical meaning.
- Wvmg-based bias: rejected by D9, which selects original Course wind.

## Consequences and pending decisions

No new sensor or cloud service is required for live start calculations. **New saved A/B coordinates now represent the estimated physical mark when the bow was there**, rather than simply the phone's observed position; check local/export/cloud semantics, provenance and historical compatibility even if no API schema field is added. The range (0–15 m), bow-at-mark instruction, one-time A/B capture correction, neutral <=2° and whole-degree bias display are product-approved. Setting location/default/precision, persistence, missing-HDG behavior, recapture of stale A/B after distance edits, and poor GPS messaging remain G2 decisions. Do not claim improved GPS accuracy, centimeter precision or guaranteed legal starts.

Historical backend start crossing still uses the recorded phone track (which must remain unchanged) while newly captured A/B endpoints may represent corrected physical marks. Making it reproduce corrected bow crossing requires a separate approved data/algorithm design including distance, HDG/time/quality and version lineage. This ADR does not authorize that collection or modification of old data. Verification is D7/D9 in the design, especially zero equivalence, HDG≠COG, oblique/outside intersections, swapped endpoints and native sensor loss.
