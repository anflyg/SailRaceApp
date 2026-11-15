# ADR-008: Core Motion wind reference

Status: accepted; physical validation pending.

The former CLHeading accuracy requirement rejected valid Core Motion samples and does not directly characterize the fused back vector. Use a shared foreground CMDeviceMotion stream and xTrueNorthZVertical, with a four-second capture, fresh unique samples, coverage and spread checks as documented in [sensors](../../sensors.md). Stability does not guarantee absolute directional accuracy. GPS is independently validated for VMG.

Persist `qualityModel: core-motion-v1` with new local wind metadata and local race export. Unmarked historical wind references may require remeasurement; other race data remains intact. No migration or parallel legacy quality model is provided. Races retain their locked post-gun wind snapshot. The existing cloud upload format is unchanged.

Security and privacy: motion and race data are processed locally, with no new cloud storage, telemetry, logs or dependencies. GPS, location and race telemetry remain personal data under existing GDPR controls. This change adds no new data category or retention policy. CRA evidence consists of automated tests and the documented physical-device validation still required before release; simulator validation remains separate. `systemUptime` remains declared in the privacy manifest.

## Tactical heading extension

The existing foreground stream also supplies continuously filtered true-north back-vector HDG for RIKTNING, tack references, lift/header cues and wind-shift estimates. GPS speed does not gate HDG; invalid or stale samples are unavailable rather than substituted with COG. GPS retains speed, over-ground VMG (including its 1.5-knot threshold), start geometry, BURN and distance. A three-second circular window reduces motion oscillation; native freshness and a 1.5-second display expiry prevent stale use. Continuous reading never starts or reconfigures the stream or capture. During an active race the existing stream remains available across tabs; backgrounding still stops it. Heading estimates remain local and transient, without new logs, cloud data or retention. This adds no new GDPR data collection or external dependency. CRA validation requires the automated tests and pending physical-device tests of heading, waves, sensor loss and concurrent wind capture.
