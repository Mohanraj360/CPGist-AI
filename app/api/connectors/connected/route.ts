import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { data, error } = await supabase.from('data_connections').select('provider,status,metadata,updated_at').eq('created_by', user.id).order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  return NextResponse.json({ connections: (data ?? []).map(c => ({ provider: c.provider, status: c.status, scope: c.metadata?.scope ?? null, updated_at: c.updated_at })) })
}
