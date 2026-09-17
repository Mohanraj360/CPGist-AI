import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDemoDataset } from '@/lib/cpg/demo-data'

export const dynamic = 'force-dynamic'

async function ensureDemoDataset(userId: string) {
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', userId).maybeSingle()
  const orgId = profile?.org_id ?? 1
  const { data: existing } = await admin.from('datasets').select('id,name,source,status,row_count,updated_at').eq('org_id', orgId).limit(1)
  if (existing?.length) return existing
  const { data: dataset, error } = await admin.from('datasets').insert({ key: `cpgist_demo_${Date.now()}`, name: 'CPGist Demo Retail Sales', table_name: 'sales_facts', source_type: 'demo', source: 'Built-in synthetic demo', status: 'ready', row_count: 24, org_id: orgId, freshness_at: new Date().toISOString() }).select('id').single()
  if (error || !dataset) throw error ?? new Error('Unable to create demo dataset.')
  const brands = await admin.from('brands').insert([
    { name: 'Apex Foods', category: 'Snacks', parent_company: 'Apex Foods Group', org_id: orgId, dataset_id: dataset.id },
    { name: 'FreshField', category: 'Snacks', parent_company: 'FreshField Co.', org_id: orgId, dataset_id: dataset.id },
    { name: 'Urban Harvest', category: 'Snacks', parent_company: 'Urban Harvest Ltd.', org_id: orgId, dataset_id: dataset.id },
  ]).select('id,name')
  if (brands.error) throw brands.error
  const retailers = await admin.from('retailers').insert([
    { name: 'QuickCart', channel: 'E-commerce', region: 'National', total_stores: 100, org_id: orgId, dataset_id: dataset.id },
    { name: 'DailyMart', channel: 'Grocery', region: 'National', total_stores: 100, org_id: orgId, dataset_id: dataset.id },
  ]).select('id,name')
  if (retailers.error) throw retailers.error
  const periods = ['2026-07-05','2026-07-12','2026-07-19','2026-07-26']
  const matrix = [[12000,13200,14100,15000],[9800,10200,11100,10900],[7600,8200,8700,9300]]
  const facts:any[]=[]
  for(let b=0;b<3;b++) for(let p=0;p<4;p++) { const sales=matrix[b][p]; const units=Math.round(sales/(5.5+b*.7)); const distribution=72+b*5+p; facts.push({dataset_id:dataset.id,brand_id:brands.data![b].id,retailer_id:retailers.data![p%2].id,category:'Snacks',period:periods[p],sales,dollar_sales:sales,week_ending:periods[p],units,price:sales/units,distribution,acv_distribution:distribution,on_promo:p===1||p===3,promo_type:p===1||p===3?'Feature':null,discount_depth_pct:p===1||p===3?10:0,org_id:orgId}) }
  const inserted=await admin.from('sales_facts').insert(facts)
  if(inserted.error) throw inserted.error
  const { data: ready, error: readyError } = await admin.from('datasets').select('id,name,source,status,row_count,updated_at').eq('id',dataset.id).single()
  if (readyError || !ready) throw readyError ?? new Error('Demo dataset was created but could not be loaded.')
  return [ready]
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ datasets: [getDemoDataset()], demo: true })
    const { data, error } = await supabase.from('datasets').select('id,name,source,status,row_count,updated_at').order('updated_at', { ascending: false })
    if (error) return NextResponse.json({ datasets: [getDemoDataset()], demo: true, warning: error.message })
    const datasets = data ?? []
    if (!datasets.length) {
      try { return NextResponse.json({ datasets: await ensureDemoDataset(user.id) }) } catch (e) { return NextResponse.json({ datasets: [getDemoDataset()], demo: true, warning: e instanceof Error ? e.message : 'Demo dataset fallback active.' }) }
    }
    return NextResponse.json({ datasets })
  } catch (error) {
    return NextResponse.json({ datasets: [getDemoDataset()], demo: true, warning: error instanceof Error ? error.message : 'Supabase is unavailable; demo data is active.' })
  }
}
