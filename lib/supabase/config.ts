export const SUPABASE_CONFIG_ERROR = 'Supabase public configuration is missing.'

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  return url && key ? { url, key } : null
}

export function isSupabaseConfigured() {
  return getSupabasePublicConfig() !== null
}
