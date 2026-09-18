import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'
const esc=(v:unknown)=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
export async function GET(request:Request){
  const u=new URL(request.url),datasetId=u.searchParams.get('datasetId');if(!datasetId)return NextResponse.json({error:'datasetId is required.'},{status:400})
  let name='CPGist Report',brands:any[]=[]
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in is required.'},{status:401});const {data:dataset}=await supabase.from('datasets').select('id,name').eq('id',datasetId).single();if(!dataset)return NextResponse.json({error:'Dataset not found.'},{status:404});name=dataset.name;brands=(await aggregateAnalytics(supabase,datasetId)).brands
  const cols=['brand','sales','units','market_share_pct'];const csv=[cols,...brands.map((b:any)=>[b.name,b.sales,b.units,b.marketShare])].map(r=>r.map(esc).join(',')).join('\n')
  return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${name.replace(/[^a-z0-9-_]+/gi,'-')}-brand-report.csv"`,'Cache-Control':'no-store'}})
}
