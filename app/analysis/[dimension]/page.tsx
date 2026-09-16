import Link from 'next/link'
import { ArrowLeft, BarChart3, Database, GitCompare, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics, brandDetail } from '@/lib/cpg/server-analytics'

const dimensions=new Set(['brand','category','product','retailer'])
export const dynamic='force-dynamic'

export default async function AnalysisPage({params,searchParams}:{params:Promise<{dimension:string}>;searchParams:Promise<{datasetId?:string;brandId?:string}>}){
  const {dimension}=await params;const qs=await searchParams
  if(!dimensions.has(dimension))return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap"><Link className="text-button" href="/"><ArrowLeft/> Back</Link><div className="panel analyst-empty"><h2>Unknown analysis dimension</h2></div></div></section></main>
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser()
  if(!user)return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap"><Link className="button primary" href="/login">Sign in</Link></div></section></main>
  const {data:datasets}=await supabase.from('datasets').select('id,name,status,row_count').eq('status','ready').order('updated_at',{ascending:false})
  const datasetId=qs.datasetId??datasets?.[0]?.id
  const analytics=datasetId?await aggregateAnalytics(supabase,datasetId):null
  const detail=dimension==='brand'&&qs.brandId&&datasetId?await brandDetail(supabase,datasetId,qs.brandId):null
  const list=dimension==='brand'?analytics?.brands:dimension==='category'?analytics?.categories:dimension==='retailer'?analytics?.retailers:[]
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter"><Link className="text-button" href="/"><ArrowLeft/> Back to workspace</Link><div className="page-heading"><div><div className="eyebrow">ANALYSIS / {dimension.toUpperCase()}</div><h1>{dimension[0].toUpperCase()+dimension.slice(1)} performance</h1><p>Calculated from the selected dataset, not placeholder values.</p></div><Link className="button secondary" href="/?view=Insights"><GitCompare/> Brand comparison</Link></div>{datasets?.length?<><div className="brand-picker">{datasets.map(d=><Link key={d.id} className={`button ${d.id===datasetId?'primary':'secondary'}`} href={`/analysis/${dimension}?datasetId=${d.id}`}>{d.name}</Link>)}</div>{detail?<section className="panel"><div className="panel-kicker">BRAND DETAIL</div><h2>{detail.name}</h2><div className="metric-row"><Metric icon={BarChart3} label="Sales" value={money(detail.metrics.sales)} delta="Observed"/><Metric icon={Target} label="Market share" value={pct(detail.metrics.marketShare)} delta="Share of dataset sales"/><Metric icon={BarChart3} label="Units" value={money(detail.metrics.units)} delta="Observed"/></div><div className="panel"><div className="panel-kicker">TREND</div>{detail.trend.map(x=><div className="dataset-row" key={x.period}><strong>{x.period}</strong><span>{money(x.sales)} sales</span><span>{money(x.units)} units</span></div>)}</div></section>:<section className="panel data-table"><div className="table-head"><span>{dimension}</span><span>Sales</span><span>Units</span><span>Share</span><span/></div>{(list??[]).map((x:any)=><div className="dataset-row" key={x.id??x.name}><strong>{x.name}</strong><span>{money(x.sales)}</span><span>{money(x.units)}</span><span>{pct(x.marketShare)}</span>{dimension==='brand'?<Link className="button secondary" href={`/analysis/brand?datasetId=${datasetId}&brandId=${x.id}`}>Details</Link>:<span/>}</div>)}</section>}</>:<div className="panel analyst-empty"><Database/><h2>No ready datasets</h2><p>Import a CSV dataset before running analysis.</p></div>}</div></section></main>
}
function money(n:number|null|undefined){return n==null?'—':new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(n)}
function pct(n:number|null|undefined){return n==null?'—':`${n.toFixed(1)}%`}
function Metric({icon:Icon,label,value,delta}:{icon:any;label:string;value:string;delta:string}){return <div className="metric-card"><div className="metric-icon"><Icon/></div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div>}
