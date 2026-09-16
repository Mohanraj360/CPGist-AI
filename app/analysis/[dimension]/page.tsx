import Link from 'next/link'
import { ArrowLeft, BarChart3, Database } from 'lucide-react'

const dimensions = new Set(['brand', 'category', 'product', 'retailer'])

export default async function AnalysisPage({ params }: { params: Promise<{ dimension: string }> }) {
  const { dimension } = await params
  const label = dimensions.has(dimension) ? `${dimension[0].toUpperCase()}${dimension.slice(1)}` : 'CPG'
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter">
    <Link className="text-button" href="/"><ArrowLeft /> Back to workspace</Link>
    <div className="page-heading"><div><div className="eyebrow">ANALYSIS / {label.toUpperCase()}</div><h1>{label} performance</h1><p>Filter real ingested CPG data by period, category, retailer, region, and channel.</p></div><div className="heading-actions"><button className="button secondary" disabled>Choose {label}</button><button className="button secondary" disabled>Last 30 days</button></div></div>
    <div className="dashboard-grid"><section className="panel analyst-empty"><BarChart3 /><h2>No {dimension} data available</h2><p>Connect and ingest a dataset before calculating sales, units, growth, share, distribution, pricing, or promotion metrics.</p><Link className="button secondary" href="/datasets">Open dataset explorer</Link></section><section className="panel dataset-side"><div className="panel-kicker">ANALYTICAL MODEL</div><h2>Metrics become available after ingestion</h2><p className="muted-copy">This view is ready for server-side aggregations and will never display fabricated business claims.</p><div className="pipeline"><div><i>1</i><span>Load dimensions</span></div><div><i>2</i><span>Aggregate measures</span></div><div><i>3</i><span>Compare periods</span></div><div><i>4</i><span>Generate story</span></div></div><Database className="analysis-db" /></section></div>
  </div></section></main>
}
