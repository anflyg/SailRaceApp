# M6a — synthetic cross-repository upload compatibility

**Verdict:** the enabled five-endpoint upload protocol is compatible at the pinned
revisions below. This is local synthetic handler evidence, **not permission to
activate uploads or evidence of a real iPhone/provider exchange**. All shipped
controls/configuration remain disabled. ADR-007 remains PROPOSED.

## Scope and reproduction

Based on SailRaceApp PR #20 `e796769a9030de5dd77eb233f73b78e45de9371d`, using:

- [API PR #49 source](https://github.com/anflyg/tackwise-api/tree/d07f525424e6d8476596f84efc0adecf4c12f9d6), read-only.
- [Contracts main snapshot](https://github.com/anflyg/tackwise-contracts/tree/28e8e7ec1f716a204e8dab73e61feb882f2520e7), read-only. The upload schema on current remote main was also checked and matches this snapshot.
- Current product Race, M2 sync/Auth architecture, security threat model and
  privacy design; API cloud identity and D5c fencing documentation. No decisions,
  accepted ADRs, policies, runtime code, reference repositories or dependencies change.

After `npm ci` in SailRaceApp, point to a local API PR #49 checkout with its locked
dependencies already installed and a contracts clone containing the pinned commit:

```sh
TACKWISE_API_PATH=/path/to/tackwise-api \
TACKWISE_CONTRACTS_PATH=/path/to/tackwise-contracts \
npm run sync:compatibility
```

The dedicated [Vitest configuration](../../scripts/upload-compatibility.config.ts)
requires the exact API commit and unchanged source/helper/fixture/manifests. The
contracts are read with `git show` at the pinned commit; its working branch is
irrelevant. No fetch/install/provider access occurs in the test command. The
opt-in suite fails on missing references rather than silently skipping, and is
separate from ordinary `npm test`/app builds. Paths are local inputs, not URLs.

[Compatibility tests](../../test/integration/upload.compat.ts) pass actual
`WorkerClient` requests to API `createApp().fetch(Request)` in process. The
`.invalid` origin is never fetched; global fetch rejects network use. This executes
backend routing, request parsing, HMAC issue/verification, ownership checks,
prepare/content/finalize services, bounded gzip/raw validation and
`FencedRawContentAdapter` verification. It reuses API
`test/helpers/raw-fence-model.ts` (`ModelFenceRepository`, `ModelRawStore`), its
existing minimal raw fixture, and the contracts' API fixtures/schemas. The small
in-memory identity/reservation/acceptance stubs follow API endpoint tests and
supply sequential database results; they implement no HTTP protocol, JWT verifier,
SQL transaction/lock behavior or alternative backend.

## Endpoint verdicts

Client source: [`workerClient.ts`](../../src/services/sync/workerClient.ts).
Backend source at the pinned revision:
[index.ts](https://github.com/anflyg/tackwise-api/blob/d07f525424e6d8476596f84efc0adecf4c12f9d6/src/index.ts),
[cloud-race-identity.ts](https://github.com/anflyg/tackwise-api/blob/d07f525424e6d8476596f84efc0adecf4c12f9d6/src/cloud-race-identity.ts),
[race-upload.ts](https://github.com/anflyg/tackwise-api/blob/d07f525424e6d8476596f84efc0adecf4c12f9d6/src/race-upload.ts),
[race-upload-content.ts](https://github.com/anflyg/tackwise-api/blob/d07f525424e6d8476596f84efc0adecf4c12f9d6/src/race-upload-content.ts).

| Endpoint | Verdict and executed evidence |
| --- | --- |
| `POST /v1/race-creation-intents` | Compatible: exact `{}`, Bearer header, 201 and exact client-validated response fields. Real backend HMAC token passes client owner/UUID/24-hour association checks; no shared identity JSON schema exists yet. |
| `POST /v1/races` | Compatible: only `creationIntent`; backend verifies HMAC and authenticated owner; 201 then 200 returns the same UUIDv4, accepted by the client. SQL identity generation/uniqueness is stubbed, not proven here. |
| `POST /v1/races/{raceId}/upload` | Compatible: all seven prepare fields validate against authoritative schema, 201 then 200 prepared and 200 accepted responses pass strict client/schema validation, identical limits and exact relative content URL. The reservation owner/key derive from the authenticated UUID. |
| `PUT /v1/races/{raceId}/upload/content` | Compatible: exact binary gzip, `application/gzip`, exact compressed Content-Length, no Content-Encoding, compressed SHA-256 and raw cloud race ID. Backend bounded expansion/raw validation and fenced model retain identical bytes. Matching pre-acceptance retry returns empty 204 without a second payload write; after acceptance the backend returns 409 `race_conflict`, which the client handles. |
| `POST /v1/races/{raceId}/upload/finalize` | Compatible: exactly version/digest, 200 accepted schema (`syncState: uploaded`, not analysis-ready), repeat succeeds without another acceptance mutation. Subsequent prepare returns accepted. |

Client raw/upload/content snapshots are byte-identical to the contracts. The
backend minimal raw fixture matches the contracts fixture and validates against
its schema. All eleven authoritative safe-error categories pass through the
actual handler's `raceUploadJson` / `raceUploadStatus` and client error mapping;
401 alone requests one refresh/retry. Error injection at the identity seam tests
transport mapping, **not whether every error originates at every endpoint**.
Existing backend negative tests remain the evidence for endpoint-specific causes.

## Concrete divergences, separate from compatible enabled behavior

1. **Disabled-gate envelope:** API `createApp` returns HTTP 404 body
   `{ "error": "not_found" }`, with request ID in the header, before Auth/work.
   `WorkerClient.json/send` expects JSON `requestId` and `{code,requestId}`;
   it therefore exposes sanitized `upstream_unavailable`, rather than a dedicated
   disabled/not-found category. The new characterization test proves this. It
   fails closed; the coordinator may conservatively retain issuance uncertainty.
   No envelope/diagnostic redesign is made here. An isolated provider test must
   use its separately approved backend flag; this result is not evidence of an
   enabled-route failure.
2. **Mock accepted-content behavior:** `createMockWorker`'s `/content` branch
   ([source](../../src/services/sync/mockWorker.ts)) has no accepted-state check;
   an identical PUT after finalize can return 204. Backend
   `RaceUploadContentService.upload` rejects an owned accepted race with 409
   `race_conflict`. The new handler retry test asserts the real behavior. The
   coordinator's prepare-before-content retry path already avoids such a PUT
   after prepare reports accepted. The mock remains a demo simulator, not full
   backend parity; no runtime changes are included in this PR.

No enabled client/backend request/response mismatch was found in the exercised
flow. Other mock shortcuts (synthetic signatures and simplified SQL/provider
state) are deliberate model limitations, not cryptographic/provider evidence.

## Evidence reused and coverage gaps

The new direct [mock cross-owner regression](../../src/services/sync/mockWorker.test.ts)
bypasses WorkerClient checks: another bearer cannot create from the first owner's
intent (400) or prepare/PUT/finalize its race (404), before or after snapshot
restore. Its attempts leave state unchanged; the original owner still completes.
This is distinct from existing client-side account-change/checkpoint tests.

Existing SailRaceApp `accountIntegration.test.ts`, `coordinator.test.ts`,
`workerClient.test.ts`, artifact/storage tests and race logger tests already cover
refresh/expiry/logout races, immutable checkpoint restart/lost responses, limits,
invalid fields, native binary serialization and offline recording. Existing API
`test/cloud-race-identity.test.ts`, `test/race-upload-endpoints.test.ts`,
`test/race-upload-content.test.ts` and `test/raw-object-fencing.test.ts` cover
negative Auth/ownership/schema/headers/digests, entitlement/expiry and conditional
write failures. These are not duplicated as another mock or claimed as newly
proven provider behavior.

The handler is executable locally; there is no handler-infrastructure blocker.
The remaining gaps are the injected boundaries: hosted Supabase JWT validation,
PostgREST/SQL gates/locks/counters, actual S3/R2 conditional commits, deployed
Worker limits and physical iPhone HTTP/storage behavior. Client Auth composition
is covered by M2c; this suite supplies a synthetic `SessionProvider` to isolate
wire compatibility. It does not perform native sign-in.

## Exact gates before the first isolated iPhone-to-Worker test

1. Approve the isolated environment/account and synthetic-only test plan. Configure
   Apple native audience, capability/entitlement/provisioning, nonce verification
   and email-optional Supabase provider as specified in
   [authentication](authentication.md). Verify canonical UUID, real JWT validation,
   refresh/revocation and Keychain behavior; no name/email ownership assumption.
2. Approve the exact backend revision and applicable M1/D5/D6 evidence. Confirm
   isolated SQL/migrations/open owner/race gates, issuance HMAC key/rotation,
   entitlement, PostgREST responses and private bucket-scoped R2 configuration.
   Complete the required legacy-writer/conditional-write and recovery drills;
   this local model does not settle provider uncertainty, retention or restores.
3. Separately review native real transport/worker-store composition and exact
   approved HTTPS origin. Never relabel real transport as mock or reuse mock
   checkpoints. Authorize any isolated backend flag change separately; all flags
   and controls in this PR remain disabled.
4. On a physical iPhone demonstrate exact gzip/size/hash/headers and no encoding
   or redirects through the approved Worker; prepare/content/finalize and retries,
   interruption/account changes, file protection/restart/backup policy, token-free
   logs and offline recording responsiveness. Use synthetic telemetry only.
   Personal-data rollout, retention/restore decisions and production activation
   remain separate approvals; ADR-007 is not accepted by this work.

See also the [M2c detailed prerequisites](m2-iphone-cloud-sync.md#remaining-prerequisites-for-isolated-iphone-to-worker-testing).

## Validation results

- `npm ci`: passed; dependency versions/lockfile unchanged.
- `npm run sync:compatibility` with the paths above: **5 passed**, no skips.
- Focused mock/account/client tests: **23 passed** across three files.
- Full `npm test -- --maxWorkers=1`: **298 passed** across 36 files, no skips.
  This includes the new direct mock cross-owner test; the five opt-in
  cross-repository cases run separately.
- `npm run build`: TypeScript and Vite passed. Output asset hashes match M2c.
- `npm run sync:validation`: passed the independent demo, receipt after reload,
  unchanged synthetic local recording, disabled real controls, phone/tablet layout,
  and zero external requests.
- `git diff --check` and local Markdown links: passed. Runtime UI, Auth, coordinator,
  client transport, mock implementation, recording code and lockfile match PR #20.

The reference repositories remain unchanged. No physical device, provider,
production network, SQL migration, feature activation, deployment or merge was used.
