export const SUPABASE_CONFIG_ERROR = 'Supabase server configuration is missing.'

function getUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? null }

export function getSupabasePublicConfig() {
  const url = getUrl()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  return url && key ? { url, key } : null
}

export function getServerSupabaseConfig() {
  const url = getUrl()
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
  return url && key ? { url, key } : null
}

export function isSupabaseConfigured() { return getSupabasePublicConfig() !== null }
export function isSupabaseServerConfigured() { return getServerSupabaseConfig() !== null }
