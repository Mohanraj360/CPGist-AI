import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
    const { data, error } = await supabase
      .from('datasets')
      .select('id,name,source,status,row_count,updated_at')
      .order('updated_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'Unable to load datasets.' }, { status: 503 })
    return NextResponse.json({ datasets: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load datasets.' }, { status: 503 })
  }
}
