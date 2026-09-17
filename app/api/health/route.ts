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
  return NextResponse.json({
    supabase: { configured: isSupabaseConfigured() },
    ollama: { configured: Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL) },
    database: { reachable: databaseReachable },
  })
}
