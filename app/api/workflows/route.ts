import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { data, error } = await supabase.from('workflows').select('id,name,definition,created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Workflows are unavailable.' }, { status: 503 })
  return NextResponse.json({ workflows: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 160) : ''
  if (!name) return NextResponse.json({ error: 'Workflow name is required.' }, { status: 400 })
  const definition = body?.definition && typeof body.definition === 'object' ? body.definition : { steps: ['ingest', 'validate', 'analyze'] }
  const { data, error } = await supabase.from('workflows').insert({ name, definition, created_by: user.id }).select('id,name,definition,created_at').single()
  if (error) return NextResponse.json({ error: 'Unable to create workflow.' }, { status: 503 })
  return NextResponse.json({ workflow: data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  const body = await request.json().catch(() => null)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const updates: Record<string, unknown> = {}
  if (typeof body?.name === 'string') updates.name = body.name.trim().slice(0, 160)
  if (body?.definition && typeof body.definition === 'object') updates.definition = body.definition
  const { data, error } = await supabase.from('workflows').update(updates).eq('id', id).select('id,name,definition,created_at').single()
  if (error) return NextResponse.json({ error: 'Unable to update workflow.' }, { status: 503 })
  return NextResponse.json({ workflow: data })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { error } = await supabase.from('workflows').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Unable to delete workflow.' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
