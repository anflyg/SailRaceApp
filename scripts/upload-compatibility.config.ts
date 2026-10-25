import { defineConfig } from 'vitest/config'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const api = process.env.TACKWISE_API_PATH
const contracts = process.env.TACKWISE_CONTRACTS_PATH
if (!api || !contracts) throw new Error('Set TACKWISE_API_PATH and TACKWISE_CONTRACTS_PATH to local read-only checkouts; see docs/architecture/m6a-upload-compatibility.md')
const apiPath = resolve(api)
const apiCommit = 'd07f525424e6d8476596f84efc0adecf4c12f9d6'
if (execFileSync('git', ['-C', apiPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== apiCommit) throw new Error(`Expected API PR #49 at ${apiCommit}`)
execFileSync('git', ['-C', apiPath, 'diff', '--exit-code', 'HEAD', '--', 'src', 'test/helpers/raw-fence-model.ts', 'test/fixtures/analysis-v1/minimal-raw-race-v1.json', 'package.json', 'package-lock.json'], { stdio: 'pipe' })
execFileSync('git', ['-C', resolve(contracts), 'cat-file', '-e', '28e8e7ec1f716a204e8dab73e61feb882f2520e7^{commit}'])
export default defineConfig({
  resolve: { alias: { '@upload-api': apiPath } },
  test: { include: ['test/integration/upload.compat.ts'], maxWorkers: 1 },
})
