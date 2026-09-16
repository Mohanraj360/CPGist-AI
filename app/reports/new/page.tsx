'use client'

import Link from 'next/link'
import { ArrowLeft, FileBarChart } from 'lucide-react'

export default function NewReportPage() {
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter">
    <Link className="text-button" href="/reports"><ArrowLeft /> Back to reports</Link>
    <div className="page-heading"><div><div className="eyebrow">REPORTS / NEW</div><h1>Configure report</h1><p>Select verified dimensions and measures before generating a report.</p></div></div>
    <section className="panel report-composer"><FileBarChart /><h2>Report generation is waiting for data</h2><p>Connect and ingest a dataset first. CPGist will then populate brand, category, product, retailer, period, metric, and chart selections from the available schema.</p><button className="button primary" disabled>Generate report</button></section>
  </div></section></main>
}
