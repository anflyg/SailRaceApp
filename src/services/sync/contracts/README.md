# Upload contract snapshots

Byte-identical snapshots from `anflyg/tackwise-contracts` commit
`28e8e7ec1f716a204e8dab73e61feb882f2520e7`. The private repository does not
publish a runtime package. Updates require explicit contract review; do not edit
schemas locally to accommodate invalid recordings or transport behavior.

| File | SHA-256 |
| --- | --- |
| `content-put-v1.json` | `a0347897ed7bb0ad8565cbceedf4e8fb97b97d7de3560cc4e26b5b815e6b3beb` |
| `race-upload-v1.schema.json` | `236e80636408148c553647808fdf7a046d4e9f26a75460bfc4fa888abbe9168b` |
| `raw-race-v1.schema.json` | `d5d13c11a1c39544e27b4c106a6399a481349990bd55de0fb498573587bd1e03` |

The identity endpoints are defined by API PR #40 at
`cf8d57e5010955840a6344dfe15c73dc4e1b1194`; the upload behavior was read at
PR #41 `b7b88e9da67122bedd1e034406a46542e7e8afdd`. Identity contracts have not
been published in the shared schema package. The adapter validates their exact
approved fields/statuses without changing that separate repository.
