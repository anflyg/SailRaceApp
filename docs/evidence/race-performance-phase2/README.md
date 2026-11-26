# Phase 2 — local race-scoped VMG (development only)

Worktree: `/private/tmp/tackwise-performance-phase2`; branch:
`feat/race-performance-phase2`. Stacked on PR #85 / `4821a5ddd15bc46678ad30c12dff073188989609`.
Freshly fetched main: `7a7f7ef3a8224b8df1d923562b309bb26c6d3d30`.
Inputs: PR #84 at `0e4480e362935b6dff4fafef37a3b470fcd46c3e`, D1–D5/D11,
proposed ADR-010 and Phase 2 delivery plan. Neither PR #84 nor #85 is modified.

## Behavior and deliberate live-only limits

- `RaceVmgWind` owns separate W0 and accepted Wvmg in memory. Initialize at a
  newly recorded gun from the approved gun-time wind. Duplicate gun callbacks
  cannot restart acquisition or rebind wind.
- Reuse `stepWindInstrument` in an independent instance: the same five-second
  tack confirmation, 20-second settling / 10-second circular-mean sampling,
  sample count, spread, sector and timestamp gates. Consume only the successful
  establishment-to-steady transition, once per fresh acceptance timestamp.
  Starboard adds current alpha/2; port subtracts it. Wtactical's implementation,
  hook, visual scale and dots remain unchanged.
- A changed alpha resets pending acquisition through the existing engine;
  accepted Wvmg stays frozen. A no-op write does not reset. Steering, tack,
  downwind, HDG loss and rejected acquisitions preserve accepted Wvmg.
- Live VMG uses only the existing filtered GPS SOG/COG and existing reliability,
  freshness and speed gating. HDG drives acquisition, never the VMG projection.
  Delayed GPS older than the current accepted reference is withheld; no reference
  history is invented to calculate earlier samples. Nothing is backfilled.
- D11: only a successful Course approval callback may bind a first late W0,
  once, with a runtime effective time. Reading/restoring Course cannot do this.
  The gun snapshot and recorded samples remain intact. Later incompatible Course
  edits withhold live VMG without replacing W0/Wvmg; compatible Course restores
  availability subject to normal GPS gates.
- State lives above tabs. Visibility/pagehide discards acquisition; foreground
  starts with fresh sensor evidence. Accepted wind stays in memory.
- **Explicit safe fallback:** no derived state, late origin or checkpoint is
  persisted. Restart and explicit Continue withhold this development VMG for the
  rest of that race, including late-origin binding. They never infer W0 from
  restored Course. End clears it; a newly recorded gun initializes a new race.
  Account context changes invalidate the runtime, including sign-out and an
  ambiguous initial/sign-in context; returning to that owner does not revive
  it. Same-owner validation on Setup remount preserves state; an initially
  ambiguous restore cannot start it. Unsigned live races use a process-local context, never durable ownership.
- **Production activation is blocked by `import.meta.env.DEV`.** Ordinary web /
  native production builds retain the original VMG path. No production flag can
  opt in. Recovery/owner policy and durable origin require G1/G3 review; logger,
  export and web analysis still use their old wind reference. No parity or release
  readiness is claimed. Physical sensor/on-water testing is deferred until after
  Phases 1 and 2, as instructed, and remains required before release.

Security/privacy/CRA/GDPR: no new telemetry, sensor stream, durable personal data,
retention, API, contracts, raw-v1, cloud permissions or network requirement.
No GPS payload, owner identifier, token or secret is logged by this change.
Transient origin/reference data disappears on process termination. This evidence
is not compliance approval; ADR-010 remains proposed and storage is deferred.

## Validation — 2026-11-26

- `npm ci --ignore-scripts --offline`: passed.
- Focused wind/reference/dashboard/GPS/HDG tests: passed, 89 tests.
- `npm test -- --reporter=dot --maxWorkers=2`: 592 passed, one unrelated existing
  `raceExport.test.ts` failure: expected build `14`, project parser reads Watch
  target build `1`. No export/build-number changes or test bypass were made.
- `node scripts/check-race-vmg-lifecycle.mjs`: passed. Real hook with synthetic
  input: 5+30 s acquisition, tab switch during acquisition, frozen steering VMG,
  alpha change, background/foreground pending reset, reacquisition and explicit
  recovery invalidation. No browser errors. Existing duplicate WindHeading plugin
  registration warnings appear when dynamically importing the synthetic harness.
- `npm run build`: passed; existing >500 kB chunk advisory remains.
- `git diff --check`: passed.

### Native Build and Run in the implementation worktree

Built a **development** web bundle with `NODE_ENV=development npm run build`,
then ran `npx cap sync ios` in this worktree so the new VMG code is enabled in the
simulator bundle. Restored only Capacitor's generated iOS platform bump (16 back
to the tracked 15); no native project/configuration change is included.
Opened `/private/tmp/tackwise-performance-phase2/ios/App/App.xcodeproj` in Xcode.

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,id=D670449D-FD8E-4DFB-9412-C1BDC7733D81' \
  -derivedDataPath /private/tmp/tackwise-performance-phase2-derived \
  CODE_SIGNING_ALLOWED=NO build
```

**BUILD SUCCEEDED**, Xcode 27.2, iPhone 17 Pro / iOS 26.5. Installed the resulting
`Debug-iphonesimulator/TackWise Race.app` and launched `com.anflyg.sailraceapp`
(final launch PID 2652). [Observed native Setup UI](native-run.png), behind the first-run
location prompt. No permission was accepted. Simulator is unavailable to the UI
controller, so native interaction beyond launch/render and native sensor behavior
are **not verified**. Full log: `/private/tmp/phase2-native-build-final.log`.
The final ordinary production web build also passed with activation disabled.

Next safe action: review this stacked draft and the conservative recovery fallback;
keep production blocked until separately approved recovery and logger parity are
implemented. Resolve the export fixture issue separately. Perform the deferred
physical-device/on-water acceptance after Phases 1 and 2; do not release by implication.
