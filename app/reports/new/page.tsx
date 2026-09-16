'use client'
import Link from 'next/link'
import { ArrowLeft, FileBarChart, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function NewReportPage() {
  const [datasets, setDatasets] = useState<any[]>([])
  const [datasetId, setDatasetId] = useState('')
  const [name, setName] = useState('CPG performance report')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { fetch('/api/datasets').then(r => r.json()).then(d => { setDatasets(d.datasets ?? []); const ready=(d.datasets??[]).find((x:any)=>x.status==='ready'); if(ready)setDatasetId(ready.id) }).catch(()=>{}) }, [])
  const create = async () => {
    if (!datasetId || !name.trim()) return
    setLoading(true); setMessage('')
    try {
      const r=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,datasetId})})
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Unable to create report')
      window.location.assign(`/reports/${d.report.id}`)
    } catch(e) { setMessage(e instanceof Error?e.message:'Unable to create report') } finally { setLoading(false) }
  }
  return <main className="cpg-shell"><section className="cpg-main"><div className="content-wrap page-enter"><Link className="text-button" href="/reports"><ArrowLeft/> Back to reports</Link><div className="page-heading"><div><div className="eyebrow">REPORTS / NEW</div><h1>Configure report</h1><p>Generate a report from the selected dataset's actual analytics.</p></div></div><section className="panel report-composer"><FileBarChart/><div className="settings-field"><label>Report name</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="settings-field"><label>Dataset</label><select value={datasetId} onChange={e=>setDatasetId(e.target.value)}><option value="">Select dataset</option>{datasets.map(d=><option key={d.id} value={d.id}>{d.name} · {d.row_count.toLocaleString()} rows</option>)}</select></div>{message&&<p className="status-warning">{message}</p>}<button className="button primary" disabled={!datasetId||loading} onClick={create}>{loading?<><LoaderCircle className="spin"/> Creating...</>:<><FileBarChart/> Generate report</>}</button></section></div></section></main>
}
