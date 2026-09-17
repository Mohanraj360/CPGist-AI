import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const demoBrands = [
  { name: 'Apex Foods', category: 'Snacks', parent_company: 'Apex Foods Group' },
  { name: 'FreshField', category: 'Snacks', parent_company: 'FreshField Co.' },
  { name: 'Urban Harvest', category: 'Snacks', parent_company: 'Urban Harvest Ltd.' },
]
const demoRetailers = [
  { name: 'QuickCart', channel: 'E-commerce', region: 'National' },
  { name: 'DailyMart', channel: 'Grocery', region: 'National' },
]

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).maybeSingle()
  const orgId = profile?.org_id ?? 1
  const { data: existing } = await admin.from('datasets').select('id,name').eq('org_id', orgId).limit(1)
  if (existing?.length) return NextResponse.json({ datasetId: existing[0].id, created: false })

  const { data: dataset, error: datasetError } = await admin.from('datasets').insert({ key: `cpgist_demo_${Date.now()}`, name: 'CPGist Demo Retail Sales', table_name: 'sales_facts', source_type: 'demo', source: 'Built-in synthetic demo', status: 'ready', row_count: 24, org_id: orgId, freshness_at: new Date().toISOString() }).select('id').single()
  if (datasetError) return NextResponse.json({ error: datasetError.message }, { status: 503 })

  const brandRows = demoBrands.map(x => ({ ...x, org_id: orgId, dataset_id: dataset.id }))
  const { data: brands, error: brandError } = await admin.from('brands').insert(brandRows).select('id,name')
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 503 })
  const retailerRows = demoRetailers.map(x => ({ ...x, org_id: orgId, dataset_id: dataset.id, total_stores: 100 }))
  const { data: retailers, error: retailerError } = await admin.from('retailers').insert(retailerRows).select('id,name')
  if (retailerError) return NextResponse.json({ error: retailerError.message }, { status: 503 })

  const periods = ['2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26']
  const salesMatrix = [[12000, 13200, 14100, 15000], [9800, 10200, 11100, 10900], [7600, 8200, 8700, 9300]]
  const facts: any[] = []
  for (let b = 0; b < brands.length; b++) for (let p = 0; p < periods.length; p++) {
    const sales = salesMatrix[b][p]
    facts.push({ dataset_id: dataset.id, brand_id: brands[b].id, retailer_id: retailers[p % retailers.length].id, category: 'Snacks', period: periods[p], sales, dollar_sales: sales, week_ending: periods[p], units: Math.round(sales / (5.5 + b * 0.7)), price: sales / Math.round(sales / (5.5 + b * 0.7)), distribution: 72 + b * 5 + p, acv_distribution: 72 + b * 5 + p, on_promo: p === 1 || p === 3, promo_type: p === 1 || p === 3 ? 'Feature' : null, discount_depth_pct: p === 1 || p === 3 ? 10 : 0, org_id: orgId }
  }
  const { error: factError } = await admin.from('sales_facts').insert(facts)
  if (factError) return NextResponse.json({ error: factError.message }, { status: 503 })
  return NextResponse.json({ datasetId: dataset.id, created: true })
}
