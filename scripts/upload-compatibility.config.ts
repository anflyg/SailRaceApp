import { defineConfig } from 'vitest/config'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const api = process.env.TACKWISE_API_PATH
const contracts = process.env.TACKWISE_CONTRACTS_PATH
if (!api || !contracts) throw new Error('Set TACKWISE_API_PATH and TACKWISE_CONTRACTS_PATH to local read-only checkouts; see docs/architecture/m6a-upload-compatibility.md')
const apiPath = resolve(api)
const apiCommit = '28e0c59bcac4c1baf644a8367ca00a0c25502ead'
if (execFileSync('git', ['-C', apiPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== apiCommit) throw new Error(`Expected merged API baseline at ${apiCommit}`)
execFileSync('git', ['-C', apiPath, 'diff', '--exit-code', 'HEAD', '--', 'src', 'test/helpers/raw-fence-model.ts', 'test/fixtures/analysis-v1/minimal-raw-race-v1.json', 'package.json', 'package-lock.json'], { stdio: 'pipe' })
execFileSync('git', ['-C', resolve(contracts), 'cat-file', '-e', '52d4a155f2bf324acf4f6f42baa766d672c5391e^{commit}'])
export default defineConfig({
  resolve: { alias: { '@upload-api': apiPath } },
  test: { include: ['test/integration/upload.compat.ts'], maxWorkers: 1 },
})
