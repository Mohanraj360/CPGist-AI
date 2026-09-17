import Link from 'next/link'
import { ArrowLeft, BarChart3, FileBarChart, Database, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

export const dynamic='force-dynamic'
export default async function ReportDetailPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap"><Link className="text-button" href="/login">Sign in</Link></div></section></main>
  const {data:report}=await supabase.from('reports').select('id,name,status,dataset_id,created_at').eq('id',id).single()
  if(!report) return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap"><Link className="text-button" href="/reports"><ArrowLeft/> Back</Link><div className="panel analyst-empty"><FileBarChart/><h2>Report not found</h2></div></div></section></main>
  const analytics=report.dataset_id?await aggregateAnalytics(supabase,report.dataset_id):null
  const rows=analytics?.brands.slice(0,10).map(b=>({brand:b.name,sales:b.sales,marketShare:b.marketShare,units:b.units}))??[]
  const datasetName = report.dataset_id ? String(report.dataset_id) : 'No dataset'
  const csv=encodeURIComponent(JSON.stringify(rows))
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter"><Link className="text-button" href="/reports"><ArrowLeft/> Back to reports</Link><div className="page-heading"><div><div className="eyebrow">REPORT / {report.id.slice(0,8)}</div><h1>{report.name}</h1><p>{analytics ? `Dataset ${datasetName}` : 'No dataset'} · Generated from live Supabase analytics</p></div><a className="button secondary" href={`/api/export/report?datasetId=${report.dataset_id??''}&rows=${csv}`}><Download/> Export CSV</a></div><section className="panel"><div className="panel-kicker">EXECUTIVE METRICS</div>{analytics?<div className="metric-row"><Metric icon={Database} label="Facts" value={analytics.metrics.rowCount.toLocaleString()} delta="Rows analyzed"/><Metric icon={BarChart3} label="Sales" value={money(analytics.metrics.sales)} delta="Observed sales"/><Metric icon={BarChart3} label="Brands" value={String(analytics.brands.length)} delta="Observed brands"/></div>:<p>No dataset attached.</p>}</section><section className="panel data-table"><div className="panel-kicker">BRAND PERFORMANCE</div>{rows.length?<>{<div className="table-head"><span>Brand</span><span>Sales</span><span>Share</span><span>Units</span></div>}{rows.map(r=><div className="dataset-row" key={r.brand}><strong>{r.brand}</strong><span>{money(r.sales)}</span><span>{pct(r.marketShare)}</span><span>{money(r.units)}</span></div>)}</>:<p>No brand facts available.</p>}</section></div></section></main>
}
function money(n:number|null|undefined){return n==null?'—':new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(n)}
function pct(n:number|null|undefined){return n==null?'—':`${n.toFixed(1)}%`}
function Metric({icon:Icon,label,value,delta}:{icon:any;label:string;value:string;delta:string}){return <div className="metric-card"><div className="metric-icon"><Icon/></div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div>}
