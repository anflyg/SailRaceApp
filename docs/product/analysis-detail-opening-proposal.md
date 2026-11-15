# Proposal: opening detailed race analysis

**Status: proposed; not approved and not an activation authorization.**

The desired customer experience is to select an accepted race and see its published analysis in the shared map-first workspace. A future change could request the owner-authorized detailed result automatically after selection when detail capability is enabled and the result is ready. This would replace the current explicit action that requests precise GPS for the selected race.

Automatic retrieval changes when private location data enters browser working memory, including for races selected only to inspect summaries. Before adopting it, the product/security/privacy owners must approve that interaction and assess necessity, data minimization, lawful basis and any notice changes, retention in memory, shared-device exposure, abort/clearing on race/account/logout, stale responses, resource limits and applicable CRA/GDPR evidence. It does not change the requirement that every Worker read independently verifies authenticated ownership, or authorize broader internal-alpha access, new backend gates, storage, or production rollout. Existing ADR-004 and release prerequisites remain authoritative.

Until approved, selection may show the common workspace and its published summary, with an explicit detail-opening action in the map panel. Close, logout and account/race changes must discard detail and cancel in-flight requests. No synthetic positions, marks or measurements may stand in for missing private data.
