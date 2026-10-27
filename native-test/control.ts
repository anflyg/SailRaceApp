import { publicAuthConfig } from '../src/services/auth/supabase'
import type { IsolatedNativeConfig } from '../src/services/sync/isolatedNative'
export { NativeTestControl } from '../src/services/sync/nativeTestControl'

export function testConfig(env: Record<string, unknown>): IsolatedNativeConfig | null {
  const auth = publicAuthConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (env.VITE_NATIVE_TEST_APPROVAL !== 'approved-synthetic-only' || !auth
    || typeof env.VITE_NATIVE_TEST_WORKER_ORIGIN !== 'string' || !env.VITE_NATIVE_TEST_WORKER_ORIGIN
    || env.VITE_NATIVE_TEST_WORKER_ORIGIN !== env.VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN) return null
  return { purpose: 'synthetic-nonproduction', workerOrigin: env.VITE_NATIVE_TEST_WORKER_ORIGIN,
    approvedWorkerOrigin: env.VITE_NATIVE_TEST_APPROVED_WORKER_ORIGIN as string, auth }
}
