import Link from 'next/link'
import { ArrowLeft, FileBarChart } from 'lucide-react'

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter">
    <Link className="text-button" href="/reports"><ArrowLeft /> Back to reports</Link>
    <div className="page-heading"><div><div className="eyebrow">REPORT / {id}</div><h1>Report detail</h1><p>Executive summary, verified metrics, charts, and recommendations.</p></div></div>
    <section className="panel analyst-empty report-composer"><FileBarChart /><h2>Report not available</h2><p>This report has not been generated in the current workspace. Generate a report after data ingestion is complete.</p><Link className="button secondary" href="/reports/new">Configure report</Link></section>
  </div></section></main>
}
