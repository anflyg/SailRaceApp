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

## Optional geographic map backgrounds and context

### Proposed product behavior

Offer map backgrounds as an optional post-race analysis preference:

- **Simple analysis map (default):** a restrained, provider-independent coordinate background suitable for reading GPS tracks, with scale and position cues but no unlicensed geographic feature data. It should render without contacting an external map provider. Any coastline or other geographic basemap feature requires a separately approved data license.
- **Satellite imagery:** optional external imagery.
- **Hybrid imagery:** optional imagery with provider-supplied labels/features, subject to the provider's terms and required attribution.
- **3D terrain:** a possible future mode only. No provider, dataset, SDK, license or delivery date is selected.

The background is visual context. It is never a nautical chart, a source of navigational instructions, or a substitute for official charts, notices, instruments or race-course configuration. Show a persistent “Analysis only — not for navigation” notice when a map is shown, including when imagery is selected.

### GPS overlay, replay and lap comparison

- Draw the validated track from the analysis result's original WGS84 coordinates and timestamps. Preserve source points, signed metrics, gaps and uncertainty. Any line simplification is display-only and must not change the source data, replay timing, metric calculation or distance calculations.
- Keep a shared geographic coordinate reference and map extent for all compared laps. Use clearly distinguishable, accessible line styles and a legend; users can select which laps are visible. Do not shift, warp, time-normalize or snap geographic tracks to make them appear to overlap.
- Synchronize replay to the recorded timestamps and show the position at the current replay time from the validated source sample. If a display interpolation is later proposed for irregular intervals, identify it as an interpolated display position and leave the underlying sample/metric unchanged.
- Allow a user to select a geographic section and compare the portions of multiple laps that cross it, using the same section bounds, projection and scale. State the selection rule, segment time range, sample coverage and whether the comparison follows spatial position or lap progress. A map selection does not create a course mark or imply tactical equivalence.
- Keep basemap requests separate from race-result requests. Do not include account IDs, race IDs, timestamps, raw track samples, replay position or other race payload in provider requests, URL parameters, referrers, analytics or provider logs. Do not send a raw GPS track to a basemap provider.
- Before any external provider request, show the provider identity and a clear notice that the visible map area and ordinary network metadata (such as IP address) may be disclosed. Require the user's explicit opt-in after that notice; only then may the browser load that provider's script, style or tiles. The choice can be declined and withdrawn. The provider-free simple map remains usable without that choice.
- Provider choice may be scoped to the current view/session until a reviewed preference-storage decision exists. Do not persist viewed locations as a side effect of remembering the visual preference.

### Optional distance-to-shore and environmental context

Distance-to-shore is a separate derived analysis, not a basemap feature. It may only be considered using an independently licensed shoreline/coastal geographic dataset whose license permits the intended computation, presentation, retention and export. Do not trace, digitize, infer, or calculate shoreline geometry from Google or other basemap imagery. Do not send GPS points to a provider for nearest-shore lookup.

A future specification must identify dataset owner and license, version/date, coordinate reference, resolution, geographic coverage, shoreline definition and uncertainty. A shoreline is time- and scale-dependent; tides, shoreline change, chart datum, generalization and GPS accuracy can dominate small distance differences. Show data vintage and uncertainty, and suppress unsupported precision or coverage gaps. A distance-to-shore value is geographic context, not a safe navigation clearance.

Terrain, shoreline, wind and current layers may help users investigate a coincidence or possible environmental influence. Clearly separate:

1. **Measured observation:** values from the race samples or an identified instrument/source, with time, units and quality.
2. **Derived estimate:** a calculation from named inputs and a versioned method, marked as derived.
3. **Possible explanation:** a hypothesis for further investigation, explicitly unproven.

Do not claim that terrain caused a wind change, that current caused a speed difference, or that shore proximity caused a sailing outcome from map imagery or correlation alone. Map appearance is not a measurement of wind/current. Environmental datasets or provider services require independent provenance, licensing, privacy and accuracy review.

### Provider comparison for review — no selection

This is a high-level product/terms screen, not a legal or procurement approval. Public list prices below were checked **25 October 2026**, in USD, and exclude tax, negotiated terms, quota configuration and usage outside the stated map product. Recheck current prices and binding terms before any decision.

| Topic | Google Maps Platform (Maps JavaScript API) | Licensed alternative: Mapbox GL JS |
| --- | --- | --- |
| Background options | Roadmap, satellite, hybrid and terrain map types are documented. Hybrid combines imagery and labels. [Map types](https://developers.google.com/maps/documentation/javascript/maptypes) | Mapbox GL JS supports style/layer composition; Mapbox supplies satellite imagery and styles. A hybrid presentation must use a compatible licensed style/layer combination and its full attribution. [Mapbox Raster Tiles API](https://docs.mapbox.com/api/maps/raster-tiles/), [attribution requirements](https://docs.mapbox.com/help/dive-deeper/attribution/) |
| Indicative web map cost | Dynamic Maps: 10,000 free billable map loads per month, then list price $7 per 1,000 in the first paid tier (up to 100,000); volume tiers follow. Satellite/hybrid map types in Maps JavaScript API are map views, but confirm applicable billing SKUs and current EEA account terms before estimating. [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [SKU trigger](https://developers.google.com/maps/billing-and-pricing/sku-details) | Mapbox GL JS: up to 50,000 monthly map loads free; then $5 per 1,000 in the 50,001–100,000 tier. A load begins when the GL JS Map object initializes; interaction is included within that load, up to the documented session limit. Verify whether the selected satellite/data configuration adds separate billable services. [Pricing](https://www.mapbox.com/pricing), [GL JS billing definition](https://docs.mapbox.com/mapbox-gl-js/guides/pricing/) |
| Attribution and content terms | Required Google Maps and third-party imagery attribution must remain visible. Google content cannot be scraped or cached except where expressly allowed, and terms restrict creating derived content from Maps content, including tracing features from satellite imagery. Do not combine Google Maps content with a non-Google map. EEA billing accounts have separate terms; the applicable current agreement controls. [Policies and attribution](https://developers.google.com/maps/documentation/javascript/policies), [Terms](https://cloud.google.com/maps-platform/terms), [EEA terms directory](https://cloud.google.com/product-terms) | Mapbox logo and text attribution are required for Mapbox styles/data; data-source attribution such as OpenStreetMap or other provider notices must also remain legible. Terms, tileset licenses and data-provider terms must be reviewed for the selected imagery/style. [Attribution](https://docs.mapbox.com/help/dive-deeper/attribution/), [Terms of Service](https://www.mapbox.com/legal/tos) |
| Compatibility | Managed browser JavaScript API with built-in map types and coordinate-based polylines. Good fit for straightforward track overlays; vendor-specific API and terms tie map content to Google maps. [Shapes and lines](https://developers.google.com/maps/documentation/javascript/shapes) | Browser WebGL renderer with sources and style layers, giving more control over multiple track layers and styles. Current GL JS requires WebGL2, which must be checked against supported browsers/devices. [Add data](https://docs.mapbox.com/mapbox-gl-js/guides/add-your-data/), [browser requirements](https://docs.mapbox.com/mapbox-gl-js/) |
| Performance considerations | Hosted map rendering avoids maintaining a tile service. Track/replay overlays still need measurement for long tracks, several laps, low-powered devices and repeated redraws. No 50k-sample performance claim is made here. | WebGL style layers are suited to complex geographic overlays; vendor docs warn that loading an entire large GeoJSON source can perform worse than tiled/vector sources. Keep telemetry in the browser and benchmark display-only simplification and replay updates. [Data rendering guidance](https://docs.mapbox.com/mapbox-gl-js/guides/add-your-data/) |
| GDPR and location disclosure | Browser map requests necessarily contact Google and include ordinary request/network metadata; map view/tile requests reveal the area being viewed. No raw track upload is required by this design, but viewport disclosure is still location-related. Review Google’s EEA terms, controller/data-processing terms, transfers, cookies/storage, consent UX, retention and key exposure before approval. [Google EEA terms directory](https://cloud.google.com/product-terms) | Mapbox's product privacy disclosures describe limited end-user data such as IP address, app/user-agent identifiers and timestamps, and location data tied to user actions for relevant services. Tile requests expose the requested view area. Review the applicable DPA, any controller role, subprocessors, international-transfer mechanism, retention, consent UX and key restrictions. [Product privacy and DPA links](https://www.mapbox.com/legal/privacy), [transfer notice](https://www.mapbox.com/legal/notice-of-certification) |

Both options can draw coordinate-based track overlays. Neither provider should receive the raw track under this design. A provider-neutral rendering/data interface is a design preference, not a promise that imagery, style rules, caches, attribution or terms are interchangeable. Never display one provider's restricted map content on another provider's base map.

### Security, privacy and licensing approval gates

Before any provider integration is separately proposed:

- Choose whether third-party map requests are acceptable, and approve the just-in-time notice and explicit opt-in. The default view must make no external map request. Declining must not block analysis.
- Document the exact request data (including visible tile/bounds, IP, referrer, user agent, cookies/SDK telemetry), provider role, purpose, lawful basis, applicable ePrivacy/consent requirements, retention/deletion, subprocessor/transfers and privacy notice changes.
- Review binding provider terms for the actual product, region/billing account, map type, caching, attribution, overlays, derivative analysis, screenshots/exports, offline behavior and provider switching. Obtain legal/licensing review for satellite imagery, labels and every independent shoreline/terrain/wind/current dataset.
- Define security controls for browser API keys/tokens: public-client key classification, domain/referrer restrictions, least-privilege API enablement, quotas, budget alerts, key rotation and abuse response. Never ship secret server credentials.
- Decide whether external requests are blocked by CSP until consent, how consent withdrawal prevents subsequent requests, and how browser cache/service-worker behavior is handled. Do not rely on consent withdrawal to retract data already transmitted.
- Decide whether display preferences or consent state are stored, where and for how long; do not store GPS tracks, viewed map bounds or provider request histories for convenience.
- Assess supplier availability, outage/fallback behavior, performance, accessibility, attribution layout, usage cost ceilings and CRA/supply-chain implications. No provider choice, 3D feature, dependency or runtime flag is approved here.

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
