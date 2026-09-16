import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

const esc=(v:unknown)=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}

export async function GET(request:Request){
  const u=new URL(request.url), datasetId=u.searchParams.get('datasetId')
  if(!datasetId)return NextResponse.json({error:'datasetId is required.'},{status:400})
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
  if(!user)return NextResponse.json({error:'Sign in is required.'},{status:401})
  const {data:dataset}=await supabase.from('datasets').select('id,name').eq('id',datasetId).single()
  if(!dataset)return NextResponse.json({error:'Dataset not found.'},{status:404})
  const a=await aggregateAnalytics(supabase,datasetId)
  const rows=a.brands.map(b=>({brand:b.name,sales:b.sales,units:b.units,market_share_pct:b.marketShare}))
  const cols=['brand','sales','units','market_share_pct']
  const csv=[cols,...rows.map(r=>cols.map(c=>r[c as keyof typeof r]))].map(r=>r.map(esc).join(',')).join('\n')
  return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${dataset.name.replace(/[^a-z0-9-_]+/gi,'-')}-brand-report.csv"`,'Cache-Control':'no-store'}})
}
