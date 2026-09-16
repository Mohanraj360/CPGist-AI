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
  } catch { return NextResponse.json({ datasets: [], configured: false }) }
}
