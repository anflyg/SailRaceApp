# Watch-to-Race integration validation

The draft companion uses the existing Watch REMOTE interface with the Race iPhone bundle `com.anflyg.sailraceapp` and proposed companion bundle `com.anflyg.sailraceapp.watchkitapp`. The native bridge carries only control phases, command IDs, generation and revision metadata; React remains the countdown authority. Reset invokes only the countdown reset path.

## Reliability follow-up

A timeout or a disconnect with a command in flight fences the generation and makes the bridge unavailable. After that command's expiry, native requests an event-driven React resynchronization. The mounted timer view reports its committed phase; native publishes a fresh revision. A Watch that is unavailable queries after this recovery publication. No command is automatically replayed, and late confirmations cannot acknowledge the expired request. If React is unavailable, recovery remains fail-closed until a timer view can register.

- **PASS:** Native plugin tests compile the actual bridge against fake Capacitor and WatchConnectivity modules. They exercise timeout, late confirmation, stale generation, duplicate and conflicting IDs, disconnect/reconnect, recovery and no replay. They do not exercise Apple's transport.
- **PASS:** Watch model fake-transport tests cover recovery publications, failed/late queries, late acknowledgment, reconnect, stale revisions and no replay.
- **PASS:** React browser integration covers phone and Watch countdown actions, expired command suppression, recovery registration and a recovery event racing an executed command. A separate browser harness uses the real `raceLogger` and `raceStorage` callbacks to exercise recording start, pause/resume, stale gun-token rejection, start-gun registration, countdown reset while recording stays active, and a separate stop callback. This harness does not exercise AppShell's End race confirmation dialog or actual WatchConnectivity.
- **PASS:** The 44 focused TypeScript tests, TypeScript production build and unsigned generic iOS Simulator build with embedded watchOS target passed. The previous revision launched both apps on the paired simulators; it did not exercise commands.
- **NOT TESTED:** Interactive paired simulator commands for this revision. The Xcode installation has no `Simulator.app`, and `simctl io` offers screenshots/video but no input. Actual WatchConnectivity delivery, UI interaction, reconnection, full AppShell recovery and End race confirmation, physical gesture timing, accessibility and hardware race behavior remain to be verified.

The WatchTest phone target remains until the real companion has equivalent paired validation. Prototype Watch icon and naming remain pending product review. The proposed Watch bundle identity and signing/provisioning for physical devices or distribution require separate Apple account and release-owner approval. This change does not alter signing settings, entitlements, background modes or distribution.
