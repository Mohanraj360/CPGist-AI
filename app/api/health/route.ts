import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  let databaseReachable = false
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { error } = await supabase.from('datasets').select('id').limit(1)
      databaseReachable = !error
    } catch {}
  }
  const groqConfigured = Boolean(process.env.GROQ_API_KEY?.trim())
  return NextResponse.json({
    supabase: { configured: isSupabaseConfigured() },
    ai: { provider: 'Groq', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', status: groqConfigured ? 'Configured' : 'Unavailable' },
    database: { reachable: databaseReachable },
  })
}
