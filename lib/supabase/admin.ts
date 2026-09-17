import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
  if (!url || !key) throw new Error('Supabase server secret is missing.')
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
