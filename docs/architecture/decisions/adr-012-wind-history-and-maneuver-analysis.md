# ADR-012: Versioned wind lineage and quality-bounded maneuver analysis

**Status: PROPOSED — not accepted or implemented.**  
**Date:** 2026-11-26.  
**Product authority:** PR #84 D3/D6/D10/D11.
**Approvals needed:** G3/G4 in the [technical design](../race-performance-technical-design.md).

## Context

Raw-v1 has optional sample wind/heading but no general calibration events, configured alpha history or sample VMG eligibility. The app records initial wind; current AppShell does not pass optional HDG into the logger. The backend prefers sample wind to course wind and recomputes without the live app's quality gates. Result/summary/detail v1 are strict and cannot receive new maneuver/history fields implicitly. ADR-004 requires stable algorithm identities and ADR-005 immutable deterministic output.

## Proposed decision

**Owner clarification C0 (2026-11-26):** proceed with the preferred design of a **new versioned raw format**, maintaining strict historical raw-v1 compatibility; this approves a direction for architecture and contract work, **not** the schema, data collection, migration or deployment. Prefer one new reviewed raw format for complete D6 lineage, with an independently versioned analysis/result/projection path. Exact names and field definitions remain contract proposals, not schema acceptance. Keep immutable W0 and its minimal quality provenance, one ordered accepted-reference collection (locked heading, tack, alpha, acceptance time/sequence and necessary aggregate evidence), bounded tactical snapshots with availability, and per-GPS-sample effective-reference/eligibility lineage. Reuse references for tack-angle feedback. Avoid duplicate coordinates where source indices/times suffice. Do not record continuous native HDG/motion or R/S by default.

Sample lineage uses the reference effective at the source GPS timestamp, never a later processing-time calibration. Define deterministic ties, unavailable intervals, bounds and restart semantics. Proposed tactical-history cadence reuses existing recorded GPS times plus necessary bounded state transitions; assess whether that is adequate before adoption. Keep original phone coordinates; no hidden bow correction in raw tracks.

A reviewed reinterpretation of v1 sample wind as effective Wvmg may support limited numeric parity but is insufficient by itself: omitting wind triggers course fallback; native quality/debug metadata and local computed VMG are not uploaded. It cannot explain the continuously displayed tactical marker or accepted tack evidence. Do not ship a partial encoding as if it met D6 in full.

Compute post-race tack-angle observations and maneuver metrics deterministically from available evidence. **Owner approval C0:** authorize C13 as a **synthetic-only** study with known 1-second truth downsampled to the existing 5-second cadence; do not read real race data or change logging/production code. Prove feasibility on labelled synthetic traces at current cadence first. G4 confidence and maneuver-loss metrics remain undecided pending the results. Present uncertain/unavailable classifications where GPS/COG or missing HDG/wind cannot distinguish a tack/gybe. Use observed sampled minimum, explicit baseline and recovery definition; qualify any modeled speed-deficit metric. Wind/course support is required for progress/VMG loss. Exact policies in D3/D10 remain experiments pending product approval.

Introduce a new `analysisVersion` for result-affecting behavior; independently version raw/result/API contracts as required. Keep v1 readers/results, require explicit reader capability for the new formats, and never automatically reanalyze/retarget historical races. Update strict backend/browser validation and owner projection only after shared contracts are approved. No extension is smuggled into existing v1 `legs`, `summary` or legacy layline events.

## C3 detailed proposal

The [C3 G3 data model and review record](../race-performance-g3-data-model.md) proposes exact candidate v2 fields, bounds, first late W0, sample eligibility, sampled tactical history, atomic recovery, export, sync, retention and deletion. It is a working specification for G1/G3 and C4 review, not an accepted contract or authority to collect. D11 requires pre-origin samples to remain unavailable and preserves the original gun snapshot. ADR-010 remains PROPOSED; unresolved origin binding, compatibility, corruption fallback and ownership remain dependencies.

## Alternatives

- Separate uploaded history sidecar: adds identity, retry, acceptance and deletion/fencing surfaces; prefer one raw artifact unless measured limits justify the complexity.
- Reconstruct full history from old per-sample wind: insufficient evidence; mark historical limits explicitly.
- Higher-frequency GPS or persistent native HDG immediately: not selected; D10 requires a separate necessity/privacy/resource review and owner approval first.
- Web-only ad hoc calculation under old result identity: risks app/backend disagreement and unstable metrics; retain as synthetic exploration only, not production analysis semantics.

## Security, privacy and CRA consequences

New stored/inferred race data is personal data. Before collection approve exact fields/cadence/counts, processing purpose, access, local/cloud/backup retention, portable export and race/account deletion coverage. Update inventory, processing record, privacy design and threat/CRA evidence in the same approved follow-up. Do not assume existing deletion/restore gaps are closed or accept ADR-007 by implication. No new legal basis or retention period is approved here.

Keep raw/detail objects private; owner-validate each Worker operation including service-role work. Preserve current conditional-write protocols rather than adding a bypass. Queue envelopes contain no telemetry. Summaries exclude track/history/location data and internal identities; browser projections exclude source/storage/digests and stay memory-only. Bound counts/bytes and processing/pair comparisons; measure CPU/memory/output against current upload and 16 MiB/16 KiB result/summary bounds before rollout. No normal logs may contain new history, raw GPS, keys or credentials.

## Acceptance and consequences

Future evidence must satisfy D3/D6/D10 in the design: deterministic effective-reference/quality parity, no look-ahead, distinguishable tactical history, historical byte compatibility, explicit unsupported versions, sampled-resolution limits, false-positive/uncertainty fixtures, cross-owner/session denial, export/deletion and resource evidence. No schema, migration, algorithm implementation, deployment or data rewrite is authorized by this proposed ADR.
