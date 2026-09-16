import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics, brandComparison, brandDetail } from '@/lib/cpg/server-analytics'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const datasetId = url.searchParams.get('datasetId')
  const brandId = url.searchParams.get('brandId')
  const compare = url.searchParams.get('compareBrandId')
  if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

    const { data: dataset, error: datasetError } = await supabase
      .from('datasets').select('id,name,status,row_count,updated_at').eq('id', datasetId).single()
    if (datasetError || !dataset) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })

    const analytics = await aggregateAnalytics(supabase, datasetId)
    const selectedBrand = brandId ? await brandDetail(supabase, datasetId, brandId) : null
    const comparison = brandId && compare
      ? await brandComparison(supabase, datasetId, [brandId, compare])
      : brandId
        ? await brandComparison(supabase, datasetId, [brandId])
        : analytics.brands.slice(0, 8)

    return NextResponse.json({
      dataset,
      ...analytics,
      selectedBrand,
      comparison,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[analytics]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Analytics are unavailable.' }, { status: 503 })
  }
}
