import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const datasetId = new URL(request.url).searchParams.get('datasetId')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  let query = supabase.from('analyses').select('id,dataset_id,prompt,result,created_at').order('created_at', { ascending: false }).limit(50)
  if (datasetId) query = query.eq('dataset_id', datasetId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Saved analyses are unavailable.' }, { status: 503 })
  return NextResponse.json({ analyses: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : ''
  if (!prompt) return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 })
  const { data, error } = await supabase.from('analyses').insert({
    dataset_id: typeof body?.datasetId === 'string' ? body.datasetId : null,
    prompt,
    result: body?.result && typeof body.result === 'object' ? body.result : {},
    created_by: user.id,
  }).select('id,dataset_id,prompt,result,created_at').single()
  if (error) return NextResponse.json({ error: 'Unable to save analysis.' }, { status: 503 })
  return NextResponse.json({ analysis: data }, { status: 201 })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { error } = await supabase.from('analyses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Unable to delete analysis.' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
