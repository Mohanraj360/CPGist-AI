import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const datasetId = new URL(request.url).searchParams.get('datasetId')
  if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })
  try { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 }); const analytics = await aggregateAnalytics(supabase, datasetId); return NextResponse.json({ datasetId, ...analytics }) } catch { return NextResponse.json({ error: 'Analytics are unavailable until the dataset schema is applied.' }, { status: 503 }) }
}
