# ADR-010: Separate accepted VMG wind from tactical wind

**Status: PROPOSED — not accepted or implemented.**  
**Date:** 2026-11-26.  
**Product authority:** PR #84 D1–D5; D3/D6 for downstream evidence.  
**Approvals needed:** G1 and relevant G3 in the [technical design](../race-performance-technical-design.md).

## Context

ADR-008 establishes native true-north W0 and transient filtered HDG. The existing tactical state machine accepts a locked mean after stable-tack acquisition, then continuously updates the tactical estimate during steering. Both live and logged wind VMG currently use initial Course wind. Copying the tactical estimate into VMG would violate D1/D2; replacing Course wind would violate W0 origin and locked post-gun snapshot semantics.

## Proposed decision

Keep three distinct values: immutable race origin W0, unchanged Wtactical, and race-scoped Wvmg. Initialize Wvmg only from usable W0. Expose a once-only reference-acceptance event from the existing tactical acceptance seam, carrying race/sequence, effective time, locked true-north mean, tack, alpha at acceptance and minimal quality evidence. Compute Wvmg from that mean plus alpha/2 on starboard or minus alpha/2 on port. Normal steering, failed acquisition and sensor loss do not replace accepted Wvmg.

Validate derived wind by its accepted origin/evidence chain, separately from the existing native capture equality gate. Reuse existing GPS freshness/reliability and speed guards for live VMG; retain the current tactical state machine/visual behavior. A reference acceptance must be idempotent and must never cross race/session boundaries. No new live controls, labels or telemetry are selected by this ADR.

Own state above tabs. Proposed recovery persists a minimal versioned local checkpoint atomically with the accepted-reference history after G3 review. Continue explicitly restores only a matching race/origin/derivation version and permitted local ownership context. Pending windows are discarded after restart/backgrounding, fresh HDG/GPS must be reacquired, and no samples are recorded before Continue. Tabs preserve runtime acquisition. New race clears the state; End stops updates. Missing/corrupt/incompatible checkpoints fall back to that race's valid W0 or unavailable, never another race's acceptance.

An alpha edit never recalculates an already accepted Wvmg. Proposed policy discards pending VMG acquisition and applies the new alpha at the next acceptance. Post-gun Course mismatch must retain existing withholding rather than silently changing the race origin. Exact interaction with the tactical engine's current resets requires a reviewed lifecycle matrix.

## Alternatives

- Continuous tactical estimate as Wvmg: rejected because steering would change the VMG reference.
- Require two tacks: rejected because D2 explicitly permits one; two tacks serve feedback only.
- Mutate W0/native measurement metadata: rejected because provenance, scale origin and historical interpretation would be corrupted.
- Runtime-only Wvmg with W0 fallback after restart: smaller implementation, but loses the accepted reference across recovery. Keep as an explicit owner-reviewed alternative if durable recovery cannot be qualified; do not silently choose it.

## Consequences and pending decisions

Local state persistence changes ADR-008's transient-only boundary for this new derived data; it needs architecture/security/privacy approval, not a silent amendment to ADR-008. Define crash atomicity, account changes and unsigned/local race ownership before implementation. Native streams, the three-second HDG filter, runtime R/S calibration and W0 capture quality model stay as established.

No cloud schema follows automatically. D6 history/lineage is separately proposed in [ADR-012](adr-012-wind-history-and-maneuver-analysis.md). No legal-compliance or release readiness is implied. Acceptance is the future evidence matrix D1/D2/D4/D5 in the design, including circular boundaries, reference replay, quality withholding and actual native/on-water validation.
