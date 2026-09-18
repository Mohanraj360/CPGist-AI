import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublicConfig, SUPABASE_PUBLIC_CONFIG_ERROR } from './config'

export function createClient() {
  const config = getSupabasePublicConfig()
  if (!config) throw new Error(SUPABASE_PUBLIC_CONFIG_ERROR)
  return createBrowserClient(config.url, config.key)
}
