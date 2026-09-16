import Link from 'next/link'
import { ArrowLeft, FileBarChart, Plus } from 'lucide-react'

export default function ReportsPage() {
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter">
    <Link className="text-button" href="/"><ArrowLeft /> Back to workspace</Link>
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE / REPORTS</div><h1>Report library</h1><p>Generate decision-ready reports from verified analytical results.</p></div><Link className="button primary" href="/reports/new"><Plus /> New report</Link></div>
    <section className="panel analyst-empty"><FileBarChart /><h2>No reports generated</h2><p>Reports become available after datasets are ingested and an analysis has produced real metrics.</p><Link className="button secondary" href="/reports/new">Configure a report</Link></section>
  </div></section></main>
}
