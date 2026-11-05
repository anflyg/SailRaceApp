import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('production analysis library surface', () => {
  it('keeps the real race library but does not mount synthetic test UI', () => {
    const source = readFileSync(new URL('./RaceAnalysisView.tsx', import.meta.url), 'utf8')
    expect(source).toContain('<RaceLibrary')
    expect(source).not.toContain('SyntheticSyncDemo')
    expect(source).not.toContain('SyntheticCloudUpload')
  })
})
