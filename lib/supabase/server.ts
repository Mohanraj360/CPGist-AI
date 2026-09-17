import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabasePublicConfig, SUPABASE_CONFIG_ERROR } from './config'

export async function createClient() {
  const cookieStore = await cookies()
  const config = getSupabasePublicConfig()
  if (!config) throw new Error(SUPABASE_CONFIG_ERROR)
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
}
