import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'
import { DEMO_DATASET_ID, getDemoAnalytics } from '@/lib/cpg/demo-data'
function escXml(value:unknown){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function pptText(title:string, body:string){return `<html><head><meta charset="utf-8"><title>${escXml(title)}</title></head><body><h1>${escXml(title)}</h1>${body}</body></html>`}
export async function GET(request:Request){
  const datasetId=new URL(request.url).searchParams.get('datasetId');if(!datasetId)return NextResponse.json({error:'datasetId is required.'},{status:400})
  let name='CPGist Report',a:any
  if(datasetId===DEMO_DATASET_ID)a=getDemoAnalytics()
  else {const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in is required.'},{status:401});const {data:dataset}=await supabase.from('datasets').select('id,name').eq('id',datasetId).single();if(!dataset)return NextResponse.json({error:'Dataset not found.'},{status:404});name=dataset.name;a=await aggregateAnalytics(supabase,datasetId)}
  const rows=a.trend.map((x:any)=>`<tr><td>${escXml(x.period)}</td><td>${x.sales}</td><td>${x.units}</td></tr>`).join('')
  const brands=a.brands.map((x:any)=>`<tr><td>${escXml(x.name)}</td><td>${x.sales}</td><td>${x.marketShare?.toFixed(1)??''}%</td></tr>`).join('')
  const body=`<h2>Key metrics</h2><ul><li>Rows: ${a.metrics.rowCount}</li><li>Total sales: ${a.metrics.sales}</li><li>Total units: ${a.metrics.units}</li><li>Average distribution: ${a.metrics.averageDistribution??'—'}</li></ul><h2>Sales trend</h2><table border="1"><tr><th>Period</th><th>Sales</th><th>Units</th></tr>${rows}</table><h2>Brand performance</h2><table border="1"><tr><th>Brand</th><th>Sales</th><th>Market share</th></tr>${brands}</table>`
  const html=pptText(name,body)
  return new NextResponse(html,{headers:{'Content-Type':'application/vnd.ms-powerpoint; charset=utf-8','Content-Disposition':`attachment; filename="${name.replace(/[^a-z0-9-_]+/gi,'-')}-report.ppt"`,'Cache-Control':'no-store'}})
}
