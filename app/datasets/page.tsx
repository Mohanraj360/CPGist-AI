import Link from 'next/link'
import { ArrowLeft, Database, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DatasetsPage() {
  let datasets: Array<{ id: string; name: string; source: string; status: string; row_count: number; updated_at: string }> = []
  let unavailable = false
  try { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (user) { const result = await supabase.from('datasets').select('id,name,source,status,row_count,updated_at').order('updated_at', { ascending: false }); datasets = result.data ?? []; unavailable = Boolean(result.error) } } catch { unavailable = true }
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter"><Link className="text-button" href="/"><ArrowLeft /> Back to workspace</Link><div className="page-heading"><div><div className="eyebrow">WORKSPACE / DATASETS</div><h1>Dataset explorer</h1><p>Browse ingested syndicated data without loading full datasets into the browser.</p></div></div><section className="panel data-table"><div className="table-toolbar"><div><div className="panel-kicker">CANONICAL DATASETS</div><h2>All datasets <span>{datasets.length}</span></h2></div><label className="global-search dataset-search"><Search /><span className="sr-only">Search datasets</span><input placeholder="Search datasets" /></label></div>{unavailable || datasets.length === 0 ? <div className="analyst-empty dataset-empty"><Database /><h2>{unavailable ? 'Dataset storage unavailable' : 'No datasets available'}</h2><p>{unavailable ? 'The database schema has not been applied in this environment.' : 'Connect a source and complete an ingestion job to explore data here.'}</p><Link className="button primary" href="/">Return to workspace</Link></div> : <><div className="table-head"><span>Dataset</span><span>Source</span><span>Status</span><span>Rows</span><span>Last updated</span></div>{datasets.map((dataset) => <Link className="dataset-row" href={`/datasets/${dataset.id}`} key={dataset.id}><strong><Database />{dataset.name}</strong><span>{dataset.source}</span><span>{dataset.status}</span><span>{dataset.row_count.toLocaleString()}</span><span>{new Date(dataset.updated_at).toLocaleDateString()}</span></Link>)}</>}</section></div></section></main>
}
