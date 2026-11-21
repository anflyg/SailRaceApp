import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({ root: resolve('watch-test'), base: './', build: { emptyOutDir: true } })
