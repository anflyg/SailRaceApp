# Watch-to-Race integration validation

The draft companion uses the existing Watch REMOTE interface with the Race iPhone bundle `com.anflyg.sailraceapp` and the proposed companion bundle `com.anflyg.sailraceapp.watchkitapp`. The native bridge sends only control phases, command IDs, generation and revision metadata; React remains the countdown authority. A timeout fences the session and disables the bridge until the timer view registers again. Reset only invokes the countdown reset path.

The proposed Watch bundle identity and signing/provisioning for physical devices or distribution require separate Apple account and release-owner approval. This change does not alter signing settings, entitlements, background modes or distribution. The WatchTest phone target is retained until the real companion has passed paired interaction and regression validation; it no longer represents the paired production companion.

Validation still needed before release: paired simulator or device command execution, acknowledgment and reconnection, timing and accessibility, interrupted and stale commands, and recording/recovery/End race behavior with the real application. Native compilation alone does not establish WatchConnectivity delivery. The WatchTest icon and naming also remain prototype assets pending product approval.
