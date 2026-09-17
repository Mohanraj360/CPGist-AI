import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ datasets: [] })
    const { data, error } = await supabase.from('datasets').select('id,name,source,status,row_count,updated_at').order('updated_at', { ascending: false })
    if (error) return NextResponse.json({ datasets: [], configured: true, error: 'Dataset storage is not available yet.' })
    return NextResponse.json({ datasets: data ?? [] })
  } catch (error) {
    const configured = !error || !(error instanceof Error && error.message.includes('Supabase public configuration'))
    return NextResponse.json({ datasets: [], configured, error: configured ? 'Dataset storage is unavailable.' : 'Supabase URL and publishable/anon key are required in the deployment environment.' }, { status: configured ? 503 : 503 })
  }
}
