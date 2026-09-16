import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const datasetId = new URL(request.url).searchParams.get('datasetId')
  if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { data, error } = await supabase.from('brands').select('id,name').eq('dataset_id', datasetId).order('name')
  if (error) return NextResponse.json({ error: 'Brands are unavailable.' }, { status: 503 })
  return NextResponse.json({ brands: data ?? [] })
}
