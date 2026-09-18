import { NextResponse } from 'next/server'
import { getSupabasePublicConfig, getServerSupabaseConfig } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

async function checkAuthService() {
  const config = getSupabasePublicConfig()
  if (!config) return false
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function GET() {
  const publicConfigured = getSupabasePublicConfig() !== null
  const serverConfigured = getServerSupabaseConfig() !== null
  let databaseReachable = false
  if (serverConfigured) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { error } = await supabase.from('datasets').select('id').limit(1)
      databaseReachable = !error
    } catch {}
  }
  const authServiceReachable = await checkAuthService()
  const groqConfigured = Boolean(process.env.GROQ_API_KEY?.trim())
  return NextResponse.json({
    supabase: {
      public: { configured: publicConfigured, status: publicConfigured ? 'READY' : 'MISSING' },
      server: { configured: serverConfigured, status: serverConfigured ? 'READY' : 'MISSING' },
    },
    database: { reachable: databaseReachable, status: databaseReachable ? 'REACHABLE' : 'UNAVAILABLE' },
    authentication: { available: authServiceReachable, status: authServiceReachable ? 'AVAILABLE' : 'UNAVAILABLE' },
    ai: { provider: 'Groq', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', status: groqConfigured ? 'Configured' : 'Unavailable' },
  })
}
