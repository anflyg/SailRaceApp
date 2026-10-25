# TackWise Analysis comparison and deterministic coaching

**Status:** Product design proposal for review. This document adds no accepted architecture, privacy, security, retention, or legal decision. It authorizes no implementation or data sharing.

## Purpose

TackWise Analysis is the post-race environment for understanding performance and learning from prior races. The current [TackWise Analysis product direction](tackwise-analysis.md) already includes track visualization, replay, speed/VMG, start and leg analysis, and race-to-race comparison over time. This document proposes how comparisons and deterministic coaching could behave, and identifies the data and decisions needed before implementation.

TackWise Race remains offline-first. Comparisons are post-race functions and must not become dependencies for race-critical use.

## Approved product goals from current documentation

The following goals are already present in current product and suite documentation:

- Help a sailor understand what happened, where performance was gained or lost, and what may be improved.
- Provide post-race track, replay, speed/VMG, manoeuvre, start, leg, upwind/downwind and mark-approach analysis progressively.
- Support race-to-race comparison and long-term development.
- Keep raw race files private, require owner authorization, and provide paths for race deletion, data export and account deletion.
- Treat race GPS/location data as personal data. Keep the iPhone race experience useful offline.

These approved directions do not settle the metric definitions, alignment rules, insight rules, or architecture described below.

## Proposed functional priorities

These are proposed sequencing priorities for product review; they do not change the M1–M7 delivery plan.

1. **P0 — Trustworthy comparison inputs.** Show source, units, time/position coverage, uncertainty and unavailable metrics. Never create missing geometry or infer a precise result from insufficient data.
2. **P1 — Within-race lap and leg comparisons.** Compare segments from one race where boundaries and metric coverage are adequate.
3. **P2 — Personal historical comparisons.** Compare a sailor's own races, with context and data-quality differences visible.
4. **P3 — Deterministic insights and coaching suggestions.** Explain repeatable observations and offer optional practice ideas without asserting causes.
5. **Future / separate review — Multi-sailor groups.** Design participant-level, per-race sharing and access lifecycle before any implementation or data access.

## Proposed comparison semantics

### Lap and leg comparisons within one race

- Use recorded or explicitly validated segment boundaries. A lap or leg must not be inferred solely from visual proximity or an undocumented heuristic.
- Keep the original elapsed time and distance for each segment. For shape comparisons, align samples by elapsed-time fraction or distance fraction and label the chosen alignment. These normalized views are explanatory; they must not replace the original timestamps or values.
- Present both absolute values and a delta with a stated direction, unit and comparison reference. Example: “Leg 2 was 18 s slower than Leg 1,” only when both durations are valid.
- Compare like with like where possible: upwind with upwind, downwind with downwind, and the same port/starboard tack category only when that classification is supported. Do not silently compare unlike or incomplete segments.
- Do not treat segment index as proof that two legs had the same wind, current, course length, mark geometry, or tactical task.
- Show missing, null, low-confidence and excluded samples. If one segment cannot support a metric, show that metric as unavailable for that comparison.
- Keep uncertainty and sample coverage alongside aggregates; never imply extra precision from interpolation or chart simplification.

### Historical comparison of one sailor's own races

- Default comparisons are between races owned by the authenticated sailor. Display race date/context from approved metadata, not guessed venue, event, boat or course titles.
- Grouping should require known compatible context. Course/route similarity, race type, boat setup, wind regime and analysis version may be useful filters, but their definitions and availability are open decisions.
- When context differs or is unknown, label the comparison as a broad historical reference rather than an equivalent-race comparison.
- Preserve the analysis version and metric definition for every result. A changed algorithm must not silently rewrite a historical value; a re-analysis must be distinguishable from the prior version.
- Show distributions and sample counts where enough comparable races exist. Do not turn a small sample into a trend claim.
- Offer explicit date/race selection and clear empty states. Do not silently substitute a demo or another race when data is unavailable.

### Windward/leeward VMG and mark-directed VMC

Metric names and sign conventions must be visible in the interface and consistent across charts, tables and insights.

- **Windward/leeward VMG:** propose defining ground-velocity VMG as the GPS-derived velocity component along the selected wind axis. For a wind-from bearing, windward progress is the component into the wind and leeward progress is the component downwind. Display signed values and units; zero or negative values are valid and must remain visible.
- **Mark-directed VMC:** propose defining velocity made good to a mark as the ground-velocity component along the bearing from the boat position toward an explicitly recorded and valid mark. Positive means closing along that bearing; negative means moving away along it. Identify which mark and bearing were used, and show when no valid mark geometry exists.
- VMG and VMC answer different questions. VMG uses the wind axis; VMC uses a mark-directed axis. Do not label one as the other or compare their values as though they shared a reference.
- A mark, gate, course line or wind direction must come from recorded, user-confirmed or otherwise validated data with provenance. Never invent course marks, locations or start-line geometry.
- If wind direction changes, the selected wind source and time window must be explicit. A single average wind axis may hide shifts; show the window and quality or mark the comparison unavailable.

These definitions are proposed and require product/analysis-owner review before they become a contract or implementation requirement.

## Wind, current and data-quality limits

- GPS-derived speed and VMG are ground-relative. Current affects ground motion; without an independently supported current estimate and a defined water-relative model, the analysis must not claim to report speed through water or isolate sailor performance from current.
- Wind may be unavailable, stale, noisy, estimated, or sourced from a manually entered direction. Show source, timestamp/window and quality where available. Do not present an estimate as an observation.
- Wind shifts, gusts, waves, traffic, course changes, equipment, crew and tactical choices can all affect a measured comparison. The data generally does not establish which factor caused a difference.
- Account for GPS accuracy, sample gaps, timestamp irregularity, sensor source, missing heading, manoeuvre classification confidence and differing sample coverage. Document metric-specific exclusion rules before comparisons are implemented.
- A comparison should be unavailable when its reference frame is absent or invalid. If partial coverage is usable, show the coverage and uncertainty rather than concealing it.
- Derived metrics must retain provenance sufficient to explain the inputs, algorithm version, units, filters and quality flags used. Avoid retaining duplicate raw telemetry solely to support a chart or explanation.

## Proposed deterministic insights

Insights should be reproducible observations over validated analysis results, not open-ended claims about a sailor.

Each insight rule should have:

- a stable rule identifier and explicit rule version;
- a declared input metric set, units, valid ranges and minimum sample/coverage requirements;
- explicit filtering, segmentation, aggregation, threshold and rounding rules;
- a stated comparison baseline and direction;
- source metric references and quality/uncertainty information;
- a deterministic explanation template with the observed values and comparison period/segment;
- a defined unavailable/insufficient-data outcome.

The same versioned input result and rule set should produce the same insight IDs, values, ordering and explanation values. Changes to thresholds or wording that change meaning require a new rule version. The explanation should make it possible to reproduce the result from the cited source metrics. Any content fingerprinting or storage format is an architecture decision and is not selected here.

Insights should describe observations, for example: “Across 4 comparable upwind legs, median windward VMG was 0.3 kn lower on port tack.” They should not claim that tack choice caused the outcome, that a maneuver “lost” time for a specific reason, or that a sailor improved because of an intervention unless the evidence supports that claim.

## Proposed coaching suggestions

Coaching is optional and should use careful, non-causal language. Suggestions may point to a repeatable observation and propose a practice focus, such as reviewing a set of tacks with lower post-manoeuvre speed recovery.

Each suggestion should:

- cite the deterministic insight and source metrics it uses;
- state the comparison scope and important limitations;
- distinguish observation from suggested practice;
- avoid ranking, diagnosis, safety-critical instruction or guaranteed outcome;
- avoid unsupported causal claims and avoid implying a coach or expert reviewed the race;
- be suppressible and clearly unavailable when evidence or sample size is insufficient.

Whether suggestions are rule-based, authored, reviewed, localized or personalized is an open product decision. No generative model, profiling system or marketing use is approved by this proposal.

## Data requirements

A future implementation may need the following inputs, subject to data minimization and contract review:

| Area | Candidate data | Required quality/provenance |
| --- | --- | --- |
| Race identity and history | Opaque race ID, owner authorization, race time range, analysis version | Server-authoritative ownership; no email/name identity |
| Track and replay | Timestamped position and valid GPS-derived velocity inputs | Coordinate validity, accuracy, gaps, ordering and sample coverage |
| Segment comparisons | Explicit or validated lap/leg boundaries and classification | Boundary source, confidence and unavailable state |
| Wind reference | Wind direction and selected time window | Source, observation/estimate status, timestamp and quality |
| Mark-directed VMC | Explicit mark coordinates or validated bearing for the segment | Mark identity within the race, provenance and validity interval |
| Historical context | Comparable segment/race characteristics where available | Known, unknown and mismatched values kept distinct |
| Insights | Versioned metrics, thresholds, filters and source references | Reproducible units, rounding and quality exclusions |

Do not add a personal-data category or collect more precise location, continuous background location, external weather data, boat/crew identity, or third-party telemetry merely because it might improve a comparison. Establish necessity and review privacy/security implications first.

## Proposed architecture and privacy decisions — not approved

These are unresolved decisions, not instructions to implement:

1. **Result representation and versioning:** decide which comparison metrics belong in the immutable analysis result, which are computed at view time, and how old results remain interpretable when metric/rule versions change.
2. **Comparison APIs and contracts:** decide whether any additional owner-scoped endpoints or versioned contracts are needed. Existing Worker-only owner authorization and private object access boundaries remain in force; browsers must not access R2 or internal storage references directly.
3. **Historical query shape and resource limits:** decide safe limits, pagination, cache behavior and compute budgets for comparing many races without exposing another owner's data.
4. **Wind/current sources:** decide whether only recorded user/device inputs are supported initially, how quality and provenance are encoded, and whether any external provider is necessary. Provider requests and transfers require separate review.
5. **Derived data retention and deletion:** decide whether new derived metrics/insight records are stored, how they are exported/deleted, and what retention applies. Existing deletion and export obligations continue to apply.
6. **Multi-sailor sharing:** public/privacy docs prohibit sharing by default and require a new assessment before team/coach access. Before implementation, decide authorization, lawful basis, participant notice/consent, data minimization, visibility, revocation, audit, export, deletion, retention, backup behavior and abuse handling.
7. **Per-race, per-participant sharing model:** any future group must require an explicit grant for each race and each included participant, with a clear recipient/group and purpose. No account-wide blanket sharing, public link, discoverability or default opt-in is implied. Decide whether participant consent is revocable and what happens to cached/downloaded comparisons after revocation.
8. **Coaching governance:** decide authorship/review, localization, accessibility, explainability, correction/reporting and whether any personalized coaching creates profiling or other additional obligations.

Any adopted architecture/privacy/security decision must be recorded through the repository's decision process and reflected in the data inventory, processing record, retention policy and threat model where applicable. This proposal changes none of those documents or decisions.

## Open product and metric decisions

- How are laps defined for sailing races where the course has no repeated lap boundary?
- Which segmentation source is authoritative, and when may an algorithm propose boundaries for user confirmation?
- What constitutes a comparable leg or race: course geometry, wind range, boat, duration, race type, or user-selected grouping?
- Is the default segment comparison time-normalized, distance-normalized, or both? Which remains primary?
- Which wind axis, source and averaging window define windward/leeward VMG, and how are wind shifts handled?
- Is mark-directed VMC calculated to a point, gate center or selected rounding target? How is the target chosen and shown?
- What thresholds, confidence measures and minimum samples make an insight eligible?
- Which contextual variables can be recorded with acceptable necessity and privacy?
- Which coaching suggestions are useful, safe, understandable and testable?
- How should users correct source data or report a misleading comparison?
- What usability, accessibility, localization and performance targets apply to long races and many-race histories?

## Acceptance criteria for a future implementation proposal

A later implementation proposal should be considered ready for review only when it can demonstrate:

1. Metric specifications with units, sign conventions, reference axes, source, time window, valid ranges and null/unavailable behavior.
2. Deterministic lap/leg alignment, segmentation, filtering and aggregation rules, including boundary and sample-gap cases.
3. UI examples that distinguish VMG from VMC, ground-relative from water-relative quantities, observations from estimates, and missing data from zero.
4. Reproducible insight fixtures proving the same versioned inputs yield the same IDs, values and explanation content.
5. Negative fixtures for insufficient data, wind shifts, current uncertainty, invalid/missing geometry, irregular timestamps, null metrics and low-confidence boundaries.
6. Coaching examples that cite their evidence, communicate limitations and avoid unsupported causal claims.
7. Historical comparison tests proving ownership isolation, version compatibility and honest handling of unlike races.
8. A privacy/security assessment before any cross-user sharing, including explicit per-race and per-participant grants, revocation, export/deletion, retention and authorization tests.
9. A reviewed data inventory/processing-record/retention/threat-model update for any new data or processing purpose.
10. A separate implementation plan that preserves offline-first racing and current M1–M7 work, and does not silently activate flags or external providers.

## References

- [TackWise Analysis product goals](tackwise-analysis.md)
- [TackWise Race product goals](tackwise-race.md)
- [System architecture](../architecture/system-architecture.md)
- [Cloud data model](../architecture/cloud-data-model.md)
- [Privacy design](../privacy/privacy-design.md)
- [Personal data inventory](../privacy/data-inventory.md)
- [GDPR processing record](../privacy/gdpr-processing-record.md)
- [Retention policy](../privacy/retention-policy.md)
- [Threat model](../security/threat-model.md)
- [CRA risk assessment](../security/cra-risk-assessment.md)
