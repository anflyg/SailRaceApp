# Race performance Phase 1 evidence

Implemented from fresh main `7a7f7ef3a8224b8df1d923562b309bb26c6d3d30` in
`/private/tmp/tackwise-performance-phase1`, branch `feat/race-performance-phase1`.
Authority: documentation-only PR #84, delivery-plan Phase 1 and D7/D8/D9/ADR-011.
No changes to PR #84, Wvmg, race logging, cloud API or raw-v1 contracts.

## Local decisions and data boundary

- Local existing app-settings storage: default 0 m, valid 0–15 m, 0.1 m entry.
  Reject invalid UI input; absent/corrupt legacy settings load the default.
- Positive-distance A/B capture requires existing fresh reliable true-north HDG;
  zero-distance capture needs GPS only. Reject unavailable/expired GPS (>5 s).
  The native true-north gate, 1.5 s heading expiry and 3 s filter are retained.
  Independent freshness limits do not prove simultaneous physical observations.
- Transform a new phone coordinate once on tap into the estimated physical mark.
  Never pass saved endpoints through the transform; distance edits and recovery
  leave them untouched. The UI explains bow-at-mark capture and explicit recapture.
  Preserve endpoint quality/accuracy without claiming that correction improves it.
- No additional per-capture HDG/distance history or provenance fields are persisted.
  Existing endpoint coordinates stay in existing local/export shapes. Legacy data
  retains its original coordinates; backend crossing still uses the unchanged
  phone track and cannot reproduce bow crossing from newly corrected marks.
- Suppress bias for poor/missing inputs and unsupported/degenerate geometry;
  warn for poor endpoints. Use the original approved Course wind, never Wvmg.
- R/S shares Setup's existing calibration/result and sensor manager. Heading is
  read in Course and Start from that manager, without adding a native stream.

Security/privacy/CRA/GDPR scope: no new personal-data category, telemetry stream,
network dependency, processor, ownership path, retention or cloud activation.
Course coordinates remain personal data in the existing race export/deletion
lifecycle. No location payloads or credentials are logged by these changes.
This is implementation evidence, not a compliance or release approval.

## Automated validation (2026-11-26)

- `npm ci --ignore-scripts --offline`: passed; audited 280 packages, 0 vulnerabilities.
- `npm run build`: passed (existing >500 kB chunk advisory).
- `npm test -- --reporter=dot --maxWorkers=2`: 570 passed, one existing failure:
  `raceExport.test.ts` expects build number `14`, while the unchanged Vite parser
  reads the first project value (`1`, the Watch test target). No export code changed.
  An initial unrestricted run also timed out on the artifact size test; it passed
  with two workers.
- Focused geometry, HDG quality, Course/Sailing/Setup/Start and settings tests:
  79 passed using `VITE_BUILD_NUMBER=14` for the export fixture. Latest dateline and
  no-double-offset assertions: all 15 geometry cases passed.
- `node scripts/check-race-performance-ui.mjs`: passed. Synthetic browser checks
  at widths 320/390/430 px and 100%/140% text, distance persistence/range rejection,
  original-wind advantage and withholding, plus both TTL/BURN placeholders on HDG
  loss. Script writes screenshots outside the repository by default.
- Existing Swift heading-math and sample-freshness fixtures compiled with their native helpers and passed; matrix convention remains conditional on physical validation.
- `git diff --check`: passed.

Screenshots: [Sailing](sailing.png), [320 px / enlarged text](sailing-narrow-large-text.png),
[Course synthetic bias](course.png). At 320 px with enlarged text, the existing
large heading is clipped at its right edge; the new R/S row and speed do not overlap.
The owner's original placement mockup is absent from the repository; direct
comparison and physical mounted-device/on-water checks remain pending.

## Native validation

`npm run build` and `npx cap sync ios` ran in this worktree. The generated
Package.swift platform bump was reverted to its tracked iOS 15 baseline; no native
configuration changes are in the PR. Opened this exact project's path in Xcode.

Xcode 27.2 (27B52), Debug, scheme App, iPhone 17 Pro / iOS 26.5 simulator
`D670449D-FD8E-4DFB-9412-C1BDC7733D81`:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,id=D670449D-FD8E-4DFB-9412-C1BDC7733D81' \
  -derivedDataPath /private/tmp/tackwise-performance-phase1-derived \
  CODE_SIGNING_ALLOWED=NO build
```

**BUILD SUCCEEDED**. Installed `TackWise Race.app` from that derived-products path;
`simctl launch ... com.anflyg.sailraceapp` succeeded and the native Setup UI rendered.
Native screenshot review found wrapped guidance overlapping the next section;
fixed its intrinsic grid-row sizing, added the browser assertion, rebuilt/synced
and repeated the successful simulator Build and Run (launch PID 91883; later
unavailable-location relaunch PID 92204). The final screenshot shows the native
first-run location prompt over the rendered Setup view; no location permission
was accepted. Further native interaction was not validated because Simulator was
not available to the computer-use controller. [Native launch screenshot](native-run.png).
Native build log is retained
at `/private/tmp/phase1-native-final.log`. An earlier command globally forcing
`-sdk iphonesimulator` incorrectly applied that SDK to the embedded Watch target;
that invocation failed and was replaced by the destination-only command above.

Native GPS/true-north/attitude fidelity requires a physical mast-mounted iPhone;
simulator presentation does not close it. No race recording, login, production
activation, merge or deployment was performed. The default-suite export assertion
and physical/on-water validation remain follow-up items before release.
