import { defineConfig, loadEnv } from 'vite'
import { publicAuthConfig } from './src/services/auth/supabase'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig(({ mode }) => {
  if (mode !== 'native-test') throw new Error('Dedicated native-test mode required')
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  if ((env.VITE_SUPABASE_URL || env.VITE_SUPABASE_PUBLISHABLE_KEY) && !publicAuthConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)) throw new Error('Only a valid public Supabase URL/key pair is allowed')
  return { root: resolve('native-test'), envDir: process.cwd(), plugins: [react()],
    build: { outDir: resolve('dist-native-test'), emptyOutDir: true } }
})
