# Watch feasibility experiment

Debug-only spike related to [PR #80](https://github.com/anflyg/SailRaceApp/pull/80). This is not a Watch product or a race-start path. The watch derives remaining time from system uptime and requests a click at 5–1 and a success haptic at zero only when its timer callback runs promptly. No background runtime is requested; missed cues are not replayed. Haptics and runtime behavior require physical testing.

The iPhone activates a Debug-only WatchConnectivity receiver. A validated, random test ID is emitted to the Capacitor `watchTest` listener in the existing guarded native-test web app; the receiver replies `processed: true` only after JavaScript calls `confirm` for that pending ID. A missing listener, invalid message, duplicate pending ID or five-second timeout yields no successful acknowledgement. Native receipt is logged without payloads; this does not record a race. No queued command is used. The native-test asset guard blocks release/archive/distribution.

## Simulator procedure

From this worktree run `npm ci`, `npm run build`, `npx --no-install cap sync ios`, then `npm run cap:copy:native-test`. Build the `WatchFeasibility` scheme for watchOS Simulator Debug unsigned first. Build the `App` scheme for iOS Simulator Debug with `CODE_SIGNING_ALLOWED=NO SKIP_INSTALL=YES` and environment variables `TACKWISE_NATIVE_TEST_BUILD=1 TACKWISE_WATCH_FEASIBILITY=1`, using the same derived-data path. The latter opt-in embeds the separately built simulator Watch app. Neither the listener nor the Watch app is embedded by an ordinary Release build. The experiment does not configure provisioning, and this embedding mechanism is simulator-only.

## Physical-device gate (NOT RUN)

H1/H2 need a separately approved HealthKit entitlement, workout-processing background mode, suitable HealthKit usage descriptions and authorization, plus approved device signing/provisioning. Prepared state may run with the wrist down without generating workout data, but background haptics in that state are unproven. H3 additionally requires explicit approval of an active workout and its purpose, App Review eligibility, health-data collection/retention and end/discard behavior; an active workout may generate or save health data. Review GDPR/privacy and CRA implications before capabilities or device tests. Audio background mode must be assessed separately if Apple's workout guidance requires it for the tested haptics. No HealthKit entitlement or background mode is included here.

H4/H5 require separately approved physical signing/provisioning and a reviewed device-capable companion embedding setup. Test foreground, locked, background and force-quit separately. Capture native receipt, JavaScript callback, reply or timeout independently. Simulator and native receipt do not prove JavaScript ran, phone recording, background delivery or physical haptics. All H1–H5 remain NOT RUN until observed on paired devices.
