# TackWise Race — Accessibility and spoken sailing controls

**Status:** Owner-approved product requirements for future implementation (2026-11-22). **Not implemented, verified or release-approved by this document.**

**Scope:** TackWise Race on iPhone. The iPhone remains mounted on the mast in its normal orientation, which is required for the intended sensor/heading references. Apple Watch remains optional and is not required or part of this feature scope.

## Product principles

- Make TackWise Race usable by sailors with impaired vision without building a separate sailing app or unnecessarily duplicating the existing interface.
- Reuse Apple accessibility and audio facilities as far as possible: VoiceOver and relevant system display settings for accessibility, Siri/App Intents for supported voice actions, AVSpeechSynthesizer for automatic spoken values, and normal iOS audio routing to the phone speaker or connected headphones (including AirPods).
- Offer a **Settings > Hjälpmedel** section. Settings and controls should be usable with Apple's normal accessibility mechanisms. No mandatory bespoke accessibility mode or voice-assistant service.
- Reuse the **existing** timer, Course actions, measured wind reference, Sailing instrument values and wind-shift indicators. Voice commands invoke the same underlying actions as the regular UI. Do not create parallel calculations or a second course model.
- Preserve existing offline-first race-critical behavior, recording lifecycle, post-gun reference locking, privacy rules and established UI. Accessibility features must not silently alter these behaviors.

## Sailing tab: spoken instrument values

Only while the **Sailing** tab is displayed, allow independent on/off and configurable speaking intervals for each of:

| Value | Exact spoken format (Swedish example) | Configuration |
| --- | --- | --- |
| Fart | "Fart 5,2" | On/off + own interval |
| VMG | "VMG 3,5" | On/off + own interval |
| Kurs / Riktning | "Kurs 130" | On/off + own interval |

- **Do not append units** to these three spoken values.
- Speak the values already accepted by the existing Sailing instruments; do not compute speech-only values, substitute invalid readings, or announce an unavailable value as valid.
- Frequency options, defaults and detailed wording for unavailable data are to be specified/confirmed before implementation; no interval or default was approved in this decision.
- Use the normal AVSpeechSynthesizer utterance queue (one shared instance for these announcements). Let queued messages play sequentially. **Do not build a custom speech-priority scheduler or interrupt policy.** Test whether frequent announcements can cause unacceptable backlog; address only an observed issue with the smallest possible change.
- Do not schedule new instrument announcements when another tab is displayed.

### Lift and header announcements (lovning/fallning)

Add an independent on/off setting in **Hjälpmedel** to speak changes in the **existing** Sailing red/green indicator state:

- Green (lift): **"Lovat 5 grader"** for one green dot and **"Lovat 10 grader"** for two, if the configured step S is 5°.
- Red (header): **"Fallit 5 grader"** for one red dot and **"Fallit 10 grader"** for two, if S is 5°.
- General rule: announce the currently indicated number of dots multiplied by the existing **Vindvridindikator grad/prick** setting S (currently 2–10 degrees/dot; default 5). Three dots correspond to 3 × S.
- Trigger speech on a **change** to a valid active indication, not repeatedly for unchanged dots. Do not introduce a new wind-shift calculation, independent threshold, or hysteresis; follow the current indicators and their quality/visibility rules.
- These announcements also occur only while the Sailing tab is displayed and use the same native speech queue. Detailed treatment of a transition to zero/neutral and rapidly changing indicators remains a future usability test, not a new algorithm decision.

## Start tab: spoken countdown

The Start tab has its own spoken countdown option in **Hjälpmedel** and does not need a custom cross-tab priority system against Sailing announcements.

- Speak remaining time on every half-minute boundary during the active countdown (including 00:30).
- Near the start, announce **00:30, 00:20 and 00:15**, then **every second from 00:10 through 00:01**.
- Play a **clear, distinct start horn/beep at 00:00**. The countdown and gun timing must follow the existing timer clock, not speech duration.
- Retain the existing 1–5-minute selections and start/pause/reset/race-recording behavior; the spoken feature must not introduce different timer logic.
- Confirm actual audible timing on physical iPhone hardware, through both speaker and Bluetooth headphones.

## Siri / App Intents: intended voice actions

Expose a small set of concrete actions using Apple standard Siri/App Intents where technically supported. The following are **desired Swedish utterances and responses**, not claims of verified Siri phrase recognition or universal support.

| Intended voice command | Action and response after success |
| --- | --- |
| "Ställ TackWise startklocka på 5 minuter" | Set existing timer selection; "Startklockan inställd på 5 minuter." |
| "Starta startklockan i TackWise" | Invoke existing start/resume action; confirm actual resulting state. |
| "Stoppa startklockan i TackWise" | Use the existing pause/stop semantics (verify wording against current UI); confirm state; do not equate with End race. |
| "Återställ startklockan i TackWise" | Invoke existing reset action; confirm resulting selection/state. |
| "Markera styrbords startpunkt i TackWise" | Capture/save the correct existing line endpoint from current valid GPS; replace a previously set endpoint; "Styrbords startpunkt sparad." |
| "Markera babords startpunkt i TackWise" | Same for babord; "Babords startpunkt sparad." |
| "Mät vindriktningen i TackWise" | Invoke the existing timed Core Motion wind capture and quality/approval rules; on success replace the current approved Course wind reference and say, for example, "Vindriktning 240 grader." |
| "Rensa banan i TackWise" | **Invoke exactly the existing Rensa banan UI action** (including its present scope and safeguards). On successful completion: "Banan är rensad." |
| "Vad är banans status i TackWise?" | Read whether both start endpoints and an approved wind reference are set, using actual existing state. |
| "Slå på fartuppläsning i TackWise" | Enable corresponding Hjälpmedel setting; "Fartuppläsning aktiverad." |

Provide matching on/off and interval-setting actions for **Fart, VMG and Kurs**, and on/off actions for spoken wind-shift cues and the spoken countdown, as supported by App Intents. Whole-settings-menu voice navigation is a **feasibility question**, not a promise to implement generic menu control.

### Voice-action invariants

- **Replace, do not duplicate:** the same mark/wind command must work when its value is unset or already set; starboard and port may be set in either order. The existing internal A/B-to-starboard/babord mapping must be verified before implementation, not guessed.
- **No new clear-course logic:** "Rensa banan" must reuse precisely the currently implemented action. It must not change countdown time or personal settings except where the existing action already would. Separate "Rensa startlinjen" or "Rensa vindriktningen" commands are **out of scope unless matching existing app actions exist**.
- Actions should not require manual navigation to a particular tab when app/platform state safely permits direct execution.
- **Results, not recognition, are confirmed:** spoken confirmation follows actual successful completion. GPS failure, wind-measurement rejection, unavailable/invalid state or action failure produces truthful spoken feedback. A failed wind remeasurement does not overwrite the previously approved reference.
- Course, timer and Sailing UI must reflect the same state as direct UI interactions. Do not bypass existing race-recording lifecycle or post-gun frozen reference rules; see [TackWise Race](tackwise-race.md) and [ADR-008](../architecture/decisions/adr-008-core-motion-wind-reference.md).
- User-visible confirmation requirements must be assessed against what Siri/App Intents actually supports in Swedish and in the relevant app/lock state. A Siri invocation is not proof that a sensor action was completed.

## Audio output, safety, privacy

- Use ordinary iOS speaker/headphone routing, not custom Bluetooth code. Users manage AirPods Transparency/Adaptive Audio in Apple's settings where supported.
- Ensure the design does not encourage isolation from ambient sailing sound. Audible cues are assistance, not a substitute for lookout or safe navigation.
- No new backend, cloud dependency, speech recording archive, race-data logging, sensor stream or GPS storage is authorized by this requirement. Prefer existing local settings persistence. Position/race data remain personal data.
- Any proposed speech recognition beyond Siri/App Intents, new microphone processing, external service, background capture or telemetry needs separate privacy/security/CRA review before implementation.

## Deferred feasibility and validation gates

Before coding, inspect only relevant current UI/actions and the latest approved repository instructions. In particular verify:

1. Current startline A/B mapping to nautical starboard/babord, and whether Siri can reach the existing UI actions without changing their semantics.
2. Current timer start/stop/pause/reset lifecycle, confirmation behavior, and how voice commands interact with recording and a locked post-gun race reference.
3. Swedish Siri/App Intents phrasing, response/confirmation and permissions on supported iOS versions; activation when phone is mast-mounted, wet/windy, headphones connected, app not foreground or device locked. **Do not assume all Siri actions work offline.**
4. Native VoiceOver usability of Settings > Hjälpmedel and existing controls; readable/high-contrast presentation without an unnecessary parallel UI.
5. AVSpeechSynthesizer speech queue behavior, selected intervals, fast wind-shift changes, language/decimal pronunciation, no uncontrolled audio backlog, and speaker/AirPods output and start-horn timing.
6. Data-minimization, audio/privacy disclosures and any CRA/security evidence needed for the actual native implementation; physical-device verification is required for sensor and Siri behavior.

**Implementation is intentionally deferred.** This document authorizes neither code work nor a release, merge, production deployment, extra data collection or an Apple Watch implementation. Changes to previously approved architecture require separate review.
