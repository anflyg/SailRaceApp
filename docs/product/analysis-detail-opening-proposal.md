# Decision: opening detailed race analysis

**Status: Product UX approved by the product owner on 2026-11-15. Security/privacy/CRA/GDPR qualification and production rollout remain separate approval gates.** This approval does not authorize switching production flags, broadening account access, bypassing ADR-004, or deploying an unfinished implementation.

## Approved customer interaction

For an authenticated user viewing an existing **ready** race in TackWise Analysis, automatically request that **selected race's** owner-authorized `owner-analysis-detail-v1` data when the existing detail capability is available and currently permitted. Show GPS track, replay, boat speed, VMG, start and leg analysis inside the shared map-first workspace without an additional "Open detailed analysis" click. This also applies to the first selected ready race when the cloud library opens.

Only the currently selected ready race should trigger the request; do **not** prefetch other races, request any GPS before a user selects/opens their race workspace, or use auto-fetch as a reason to enable a disabled detail capability. The published summary remains available if detailed data are unavailable, forbidden, not ready, or fail to load. Show a clear safe state/retry without fabricated or synthetic GPS, wind, start or course data.

## Security, privacy and lifecycle boundaries

Automatic retrieval changes the moment precise GPS enters browser working memory, including when a race is selected to inspect summary information. Preserve all existing strict constraints:

- Every request must use the authenticated, owner-scoped Worker-only API with **independent server-side race ownership verification** and existing alpha/feature/authorization gates. Client configuration is not authorization; no direct Supabase table/R2 access.
- Keep private detail bytes in memory only; do not persist them to browser storage or include them in product analytics, telemetry, URL, error reports or logs.
- Abort in-flight detail requests and discard loaded data on race/account/session change, logout and view unmount; ensure late responses cannot show the previous account's GPS. A retry must remain scoped to the current authenticated owner and selected race.
- Preserve fail-closed behavior when backend detail access is disabled, denied or absent. The current one-owner internal alpha and ADR-004 release qualification remain unchanged. This UX approval is **not** customer-wide GPS rollout authorization.
- Avoid unsolicited data for non-selected races, unnecessary repeated reads and new dependencies. Consider fetch frequency and Worker resource limits.

Before production activation, complete and record a targeted security/privacy/CRA/GDPR assessment of the changed request timing and necessity/proportionality, privacy notice/lawful basis, shared-device exposure, memory lifecycle, request/load limits, third-party processor flows and applicable ADR-004/ADR-007 release evidence. Any change to established access or hosting design requires its own review and approval.

## Implementation handoff

Implement in the **existing** TackWiseAnalysis draft PR #11, preserving its shared workspace, tests and current production configuration. Add regression tests for initial selected race, change of selection, unavailable/revoked detail capability, failure/retry, racing session/account/logout, cancellation and late responses. Do not merge or deploy as part of this product decision.

The synthetic demo remains an internal test fixture, not a second customer UX and never a replacement for real race data.
