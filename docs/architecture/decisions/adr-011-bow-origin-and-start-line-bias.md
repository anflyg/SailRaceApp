# ADR-011: Bow-origin start calculations and Course line bias

**Status: PROPOSED — not accepted or implemented.**  
**Date:** 2026-11-26.  
**Product authority:** PR #84 D7/D9.  
**Approvals needed:** G2 in the [technical design](../race-performance-technical-design.md); G3 if any extra telemetry is later requested.

## Context

Current TTL intersects a GPS-COG ray from the phone position with the finite A/B segment, then computes BURN as countdown minus TTL. The phone's mast mount can be behind the bow. COG describes motion over ground, not bow orientation. D9 separately approves a wind-based favored-end display; it does not replace the TTL calculation or revive K1/L1 marks.

## Proposed decision

Apply a pure centerline forward offset to the phone's geometric origin using fresh reliable true-north HDG. In the local east/north plane, bow equals phone plus `d*(sin HDG, cos HDG)`. Keep filtered GPS COG as ray direction and SOG as speed. Re-run the existing finite-segment intersection from that bow origin; subtracting d from TTL distance is wrong when HDG differs from COG or the line is oblique. Retain GPS/line validity and speed checks.

Propose a local-only Setup setting with default 0, finite range 0–30 meters and 0.1-meter input precision. This input precision is not coordinate accuracy. At zero, preserve existing output without adding an HDG requirement. At positive d with missing/stale HDG, propose withholding TTL/BURN with an inline reason; product approval is needed for this fallback. Do not silently orient by COG or present phone-origin output as corrected. No DTL display is selected.

Independently compute line advantage from initial approved Course wind-FROM and recorded A/B coordinates. For L=B−A and upwind unit U, dot(L,U) identifies B when positive and A when negative. Angular bias is `asin(abs(dot(L,U))/|L|)` with numerical clamping, unavailable for degenerate/unsupported geometry. Propose neutral at <=2° and whole-degree display otherwise, subject to UI/uncertainty review. Never use Wvmg or infer physical port/starboard identity from storage field names.

## Alternatives

- COG-oriented offset: rejected by D7 and physically wrong with leeway/current.
- Scalar distance subtraction: fails finite-segment/oblique geometry.
- Offset stored GPS tracks or A/B coordinates automatically: not selected; original observations must retain their meaning. Endpoint capture semantics need owner confirmation.
- Wvmg-based bias: rejected by D9, which selects original Course wind.

## Consequences and pending decisions

This can remain local and transient beyond the small mounting setting, without cloud changes or new sensors. Decide range/storage/placement, missing-HDG text, degenerate/poor-accuracy behavior, neutral tolerance and physical A/B capture semantics before implementation. Do not claim improved GPS accuracy, centimeter precision or guaranteed legal starts.

Historical backend start crossing still uses the recorded phone track. Making it reproduce corrected bow crossing requires a separate approved data/algorithm design including distance, HDG/time/quality and version lineage. This ADR does not authorize that collection or modification of old data. Verification is D7/D9 in the design, especially zero equivalence, HDG≠COG, oblique/outside intersections, swapped endpoints and native sensor loss.
