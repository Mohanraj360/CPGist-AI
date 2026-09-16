import Link from 'next/link'
import { ArrowLeft, FileBarChart, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
export default async function ReportsPage() {
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser()
  const {data}=user?await supabase.from('reports').select('id,name,status,dataset_id,created_at,updated_at').order('updated_at',{ascending:false}):{data:[]}
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter"><Link className="text-button" href="/"><ArrowLeft/> Back to workspace</Link><div className="page-heading"><div><div className="eyebrow">WORKSPACE / REPORTS</div><h1>Report library</h1><p>Stored reports are backed by Supabase and linked to datasets.</p></div><Link className="button primary" href="/reports/new"><Plus/> New report</Link></div><section className="panel data-table">{data?.length?<>{data.map(r=><Link className="dataset-row" key={r.id} href={`/reports/${r.id}`}><strong><FileBarChart/>{r.name}</strong><span>{r.status}</span><span>{r.dataset_id??'No dataset'}</span><span>{new Date(r.updated_at).toLocaleString()}</span></Link>)}</>:<div className="analyst-empty"><FileBarChart/><h2>No reports generated</h2><p>Create one from a verified dataset.</p><Link className="button secondary" href="/reports/new">Configure a report</Link></div>}</section></div></section></main>
}
