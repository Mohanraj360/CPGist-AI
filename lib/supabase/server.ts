import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getServerSupabaseConfig, SUPABASE_SERVER_CONFIG_ERROR } from './config'

export async function createClient() {
  const cookieStore = await cookies()
  const config = getServerSupabaseConfig()
  if (!config) throw new Error(SUPABASE_SERVER_CONFIG_ERROR)
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
}
