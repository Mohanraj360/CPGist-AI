'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowUpRight, BarChart3, Bell, BrainCircuit, CheckCircle2, ChevronDown, CircleHelp,
  Database, Download, FileBarChart, FileText, GitBranch, HardDrive, LayoutDashboard, Menu,
  Network, Plus, Search, Settings2, ShieldCheck, Sparkles, Workflow, Save, Play, RefreshCw,
  Upload, X, Trash2, GitCompare, Target, AlertTriangle,
} from 'lucide-react'

type Dataset = { id: string; name: string; source: string; status: string; row_count: number; updated_at: string }
type Brand = { id: string; name: string }
type Analytics = {
  dataset: Dataset
  metrics: { rowCount: number; sales: number; units: number; averagePrice: number | null; promotionRate: number | null; averageDistribution: number | null }
  trend: { period: string; sales: number; units: number }[]
  categories: { id: string; name: string; sales: number; units: number; rows: number; marketShare: number | null }[]
  brands: { id: string; name: string; sales: number; units: number; rows: number; marketShare: number | null; latestGrowth?: number | null }[]
  retailers: { id: string; name: string; sales: number; units: number; rows: number; marketShare: number | null }[]
  anomalies: { period: string | null; sales: number; zScore: number }[]
  selectedBrand?: any
  comparison?: any[]
}
type Nav = 'Overview' | 'AI Analyst' | 'Data Sources' | 'Datasets' | 'Validation' | 'Insights' | 'Reports' | 'Workflows' | 'Saved Analyses' | 'Settings'

const nav: { label: Nav; icon: any }[] = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'AI Analyst', icon: BrainCircuit },
  { label: 'Data Sources', icon: Network }, { label: 'Datasets', icon: Database },
  { label: 'Validation', icon: ShieldCheck }, { label: 'Insights', icon: Sparkles },
  { label: 'Reports', icon: FileBarChart }, { label: 'Workflows', icon: Workflow },
  { label: 'Saved Analyses', icon: Save }, { label: 'Settings', icon: Settings2 },
]

const money = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
const pct = (n: number | null | undefined) => n == null ? '—' : `${n.toFixed(1)}%`

export default function Home() {
  const [active, setActive] = useState<Nav>('Overview')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [datasetId, setDatasetId] = useState('')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [commandOpen, setCommandOpen] = useState(false)
  const [analystPrompt, setAnalystPrompt] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState<{ email?: string; user_metadata?: { full_name?: string } } | null>(null)

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3000) }

  async function loadDatasets() {
    const response = await fetch('/api/datasets', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to load datasets')
    setDatasets(data.datasets ?? [])
    if (!datasetId && data.datasets?.length) {
      const ready = data.datasets.find((d: Dataset) => d.status === 'ready') ?? data.datasets[0]
      setDatasetId(ready.id)
    }
  }

  async function loadAnalytics(id: string) {
    setRefreshing(true)
    try {
      const response = await fetch(`/api/analytics?datasetId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Analytics unavailable')
      setAnalytics(data)
      const b = await fetch(`/api/brands?datasetId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const bd = await b.json()
      if (b.ok) setBrands(bd.brands ?? [])
    } catch (e) { notify(e instanceof Error ? e.message : 'Unable to load analytics') }
    finally { setRefreshing(false); setLoading(false) }
  }

  useEffect(() => {
    fetch('/api/datasets', { cache: 'no-store' }).then(async r => {
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Unable to load datasets')
      setDatasets(d.datasets ?? [])
      const ready = (d.datasets ?? []).find((x: Dataset) => x.status === 'ready') ?? d.datasets?.[0]
      if (ready) setDatasetId(ready.id)
    }).catch(e => { notify(e instanceof Error ? e.message : 'Unable to load datasets'); setLoading(false) })
    fetch('/api/auth/user').then(r => r.ok ? r.json() : null).then(d => setUser(d?.user ?? null)).catch(() => {})
  }, [])

  useEffect(() => { if (datasetId) loadAnalytics(datasetId) }, [datasetId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(true) } if (e.key === 'Escape') setCommandOpen(false) }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  }, [])

  const selected = useMemo(() => analytics?.brands.filter(b => brandIds.includes(b.id)) ?? [], [analytics, brandIds])

  const ask = async () => {
    if (!analystPrompt.trim()) return
    setAnswer(null)
    try {
      const r = await fetch('/api/analyst', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: analystPrompt, datasetId }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Analyst failed')
      setAnswer(d); setAnalystPrompt('')
    } catch (e) { notify(e instanceof Error ? e.message : 'Analyst failed') }
  }

  const upload = async (file: File, name: string) => {
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file); if (name) form.append('name', name)
      const r = await fetch('/api/ingest', { method: 'POST', body: form }); const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      notify(`Imported ${d.rowCount.toLocaleString()} rows`)
      setUploadOpen(false); await loadDatasets(); setDatasetId(d.datasetId)
    } catch (e) { notify(e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false) }
  }

  const refresh = async () => { await loadDatasets(); if (datasetId) await loadAnalytics(datasetId); notify('Workspace refreshed') }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Workspace member'
  const initials = displayName.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()

  return <main className="cpg-shell">
    <aside className={`cpg-sidebar ${sidebarOpen ? '' : 'is-collapsed'}`}>
      <div className="brand-lockup"><div className="brand-mark"><Sparkles /></div>{sidebarOpen && <div><strong>CPGist</strong><span>AI intelligence</span></div>}</div>
      <button className="workspace-switcher" onClick={() => setActive('Settings')}><div className="workspace-avatar">C</div>{sidebarOpen && <><div className="workspace-copy"><span>Workspace</span><strong>CPGist AI</strong></div><ChevronDown className="small-icon" /></>}</button>
      <div className="nav-section-label">{sidebarOpen ? 'Workspace' : '•••'}</div>
      <nav className="primary-nav">{nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => setActive(label)}><Icon />{sidebarOpen && <span>{label}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => notify('Use the search box or ask AI Analyst for help.')}><CircleHelp />{sidebarOpen && <span>Help center</span>}</button><button className="nav-item" onClick={() => setActive('Settings')}><Settings2 />{sidebarOpen && <span>Settings</span>}</button><button className="user-card" onClick={async () => { await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {}); window.location.assign('/login') }}><div className="user-avatar">{initials}</div>{sidebarOpen && <div><strong>{displayName}</strong><span>Sign out</span></div>}</button></div>
    </aside>

    <section className="cpg-main">
      <header className="topbar"><button className="icon-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle navigation"><Menu /></button><button className="global-search" onClick={() => setCommandOpen(true)}><Search /><span>Search datasets, brands, reports...</span><kbd>⌘ K</kbd></button><div className="top-actions"><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw className={refreshing ? 'spin' : ''} /></button><span className="live-dot"><i /> Live data</span><button className="icon-button" onClick={() => setActive('Validation')}><Bell /></button><button className="top-avatar" onClick={() => setActive('Settings')}>{initials}</button></div></header>

      <div className="content-wrap page-enter">
        <div className="page-heading"><div><div className="eyebrow">CPGIST AI / WORKSPACE</div><h1>{active}</h1><p>{active === 'Overview' ? 'Evidence-first consumer packaged goods intelligence.' : `Work with real data in ${active.toLowerCase()}.`}</p></div><div className="heading-actions">
          <select className="button secondary" value={datasetId} onChange={e => setDatasetId(e.target.value)} aria-label="Active dataset"><option value="">Select dataset</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <button className="button primary" onClick={() => active === 'Datasets' ? setUploadOpen(true) : setActive('Workflows')}><Plus /> {active === 'Datasets' ? 'Import dataset' : 'New workflow'}</button>
        </div></div>

        {active === 'Overview' && <Overview analytics={analytics} datasets={datasets} onAI={() => setActive('AI Analyst')} onCompare={() => setActive('Insights')} />}
        {active === 'AI Analyst' && <Analyst prompt={analystPrompt} setPrompt={setAnalystPrompt} answer={answer} ask={ask} />}
        {active === 'Data Sources' && <Sources notify={notify} />}
        {active === 'Datasets' && <DatasetView datasets={datasets} analytics={analytics} onUpload={() => setUploadOpen(true)} onRefresh={refresh} onSelect={setDatasetId} />}
        {active === 'Validation' && <Validation analytics={analytics} />}
        {active === 'Insights' && <Comparison analytics={analytics} brands={brands} selected={selected} brandIds={brandIds} setBrandIds={setBrandIds} datasetId={datasetId} />}
        {active === 'Reports' && <Reports datasets={datasets} datasetId={datasetId} notify={notify} />}
        {active === 'Workflows' && <Workflows datasets={datasets} datasetId={datasetId} notify={notify} />}
        {active === 'Saved Analyses' && <Saved />}
        {active === 'Settings' && <Settings />}
      </div>
    </section>

    {uploadOpen && <UploadModal uploading={uploading} onClose={() => setUploadOpen(false)} onUpload={upload} />}
    {commandOpen && <div className="command-backdrop" onClick={() => setCommandOpen(false)}><div className="command-box" onClick={e => e.stopPropagation()}><div className="command-input"><Search /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search navigation..." /><kbd>ESC</kbd></div><div className="command-results">{nav.filter(x => x.label.toLowerCase().includes(query.toLowerCase())).map(({label,icon:Icon}) => <button key={label} onClick={() => {setActive(label);setCommandOpen(false)}}><Icon />{label}<span>Open</span></button>)}</div></div></div>}
    {toast && <div className="toast"><CheckCircle2 /> {toast}</div>}
  </main>
}

function Overview({ analytics, datasets, onAI, onCompare }: { analytics: Analytics | null; datasets: Dataset[]; onAI: () => void; onCompare: () => void }) {
  const trend = analytics?.trend ?? []
  return <div className="dashboard-grid">
    <div className="metric-row"><Metric icon={Database} label="Connected datasets" value={String(datasets.length)} delta={datasets.length ? `${datasets.filter(d => d.status === 'ready').length} ready` : 'Import a CSV'} /><Metric icon={BarChart3} label="Total sales" value={analytics ? money(analytics.metrics.sales) : '—'} delta={analytics ? `${analytics.metrics.rowCount.toLocaleString()} rows` : 'Select a dataset'} /><Metric icon={Target} label="Market coverage" value={analytics ? pct(analytics.metrics.averageDistribution) : '—'} delta={analytics ? 'Average distribution' : 'Calculated from data'} /></div>
    <section className="panel analyst-card"><PanelHeading kicker="AI ANALYST" title="Ask your intelligence layer" action={<button className="text-button" onClick={onAI}>Open analyst <ArrowUpRight /></button>} /><p>Ask questions about the selected dataset. The model receives only server-computed evidence from your data.</p><div className="suggestion-row"><button onClick={onAI}>Which brands have the highest share?</button><button onClick={onAI}>Find sales anomalies</button><button onClick={onCompare}>Compare brands</button></div></section>
    <section className="panel chart-panel"><PanelHeading kicker="SALES TREND" title="Real dataset trend" action={<span className="muted-copy">{trend.length} periods</span>} />{trend.length ? <LineChart points={trend.map(x => x.sales)} labels={trend.map(x => x.period)} /> : <Empty icon={Database} text="Select an ingested dataset to plot sales." />}</section>
    <section className="panel"><PanelHeading kicker="BRAND PERFORMANCE" title="Share by brand" action={<button className="text-button" onClick={onCompare}>Compare <GitCompare /></button>} />{analytics?.brands.length ? <Bars items={analytics.brands.slice(0, 8).map(x => ({ label: x.name, value: x.marketShare ?? 0 }))} /> : <Empty icon={BarChart3} text="Brand dimensions appear after brand data is ingested." />}</section>
    <section className="panel"><PanelHeading kicker="ANOMALIES" title="Observed outliers" />{analytics?.anomalies.length ? analytics.anomalies.slice(0,6).map((a,i)=><div className="activity-row" key={i}><div><strong>{a.period}</strong><span>Sales {money(a.sales)} · z-score {a.zScore.toFixed(2)}</span></div><em>Observed</em></div>) : <Empty icon={ShieldCheck} text="No statistical outliers detected in the selected dataset." />}</section>
  </div>
}

function Metric({icon:Icon,label,value,delta}:{icon:any;label:string;value:string;delta:string}) { return <div className="metric-card"><div className="metric-icon"><Icon/></div><span>{label}</span><strong>{value}</strong><small>{delta}</small></div> }
function PanelHeading({kicker,title,action}:{kicker:string;title:string;action?:React.ReactNode}) { return <div className="panel-heading"><div><div className="panel-kicker">{kicker}</div><h2>{title}</h2></div>{action}</div> }
function Empty({icon:Icon,text}:{icon:any;text:string}) { return <div className="analyst-empty"><Icon/><p>{text}</p></div> }

function LineChart({points,labels}:{points:number[];labels:string[]}) {
  const max=Math.max(...points,1), min=Math.min(...points,0), range=max-min||1
  const path=points.map((v,i)=>`${i===0?'M':'L'} ${(i/(Math.max(points.length-1,1))*100).toFixed(2)}% ${100-((v-min)/range*90+5)}%`).join(' ')
  return <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="line-chart" role="img" aria-label="Sales trend"><polyline points={points.map((v,i)=>`${(i/(Math.max(points.length-1,1))*100).toFixed(2)},${100-((v-min)/range*90+5)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/><path d={path} fill="none" stroke="currentColor" strokeWidth="0" /></svg><div className="chart-labels">{labels.filter((_,i)=>i===0||i===labels.length-1||i===Math.floor(labels.length/2)).map((x,i)=><span key={i}>{x}</span>)}</div></div>
}
function Bars({items}:{items:{label:string;value:number}[]}) { const max=Math.max(...items.map(x=>x.value),1); return <div className="bar-list">{items.map(x=><div className="bar-row" key={x.label}><span title={x.label}>{x.label}</span><div className="bar-track"><i style={{width:`${Math.max(2,x.value/max*100)}%`}}/></div><b>{x.value.toFixed(1)}%</b></div>)}</div> }

function Analyst({prompt,setPrompt,answer,ask}:{prompt:string;setPrompt:(x:string)=>void;answer:any;ask:()=>void}) {
  return <section className="analyst-workspace"><div className="terminal-header"><span className="terminal-dot"/><span>CPGist Analyst / grounded mode</span><span className="terminal-status">● {answer ? 'COMPLETE' : 'READY'}</span></div><div className="analyst-body">
    {answer ? <div className="answer"><div className="answer-label">ANALYSIS COMPLETE <span>· {answer.model || 'Ollama'}</span></div><p>{answer.answer}</p><div className="citation"><Database/> Dataset <span>{answer.dataset}</span></div><div className="citation"><Target/> Grounding confidence <strong>{answer.grounding?.score?.toFixed(1)}%</strong><span>{answer.grounding?.method}</span></div><div className="answer-actions"><button className="button secondary" onClick={()=>navigator.clipboard?.writeText(answer.answer).then(()=>{})}><Save/> Copy answer</button><button className="button secondary" onClick={()=>{const blob=new Blob([answer.answer],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cpgist-analysis.txt';a.click()}}><Download/> Export</button></div></div> : <Empty icon={Sparkles} text="Ask a question about the selected dataset. Answers are constrained to server-side evidence."/>}
    <div className="prompt-box"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="e.g. Compare the top brands by sales and market share..."/><button className="send-button" onClick={ask}><Play/></button></div>
    <div className="prompt-hints"><button onClick={()=>setPrompt('Which brands have the highest market share?')}>Brand share</button><button onClick={()=>setPrompt('Find sales anomalies and explain the observed periods.')}>Anomalies</button><button onClick={()=>setPrompt('Summarize the latest sales trend.')}>Trend summary</button></div>
  </div></section>
}

function Sources({notify}:{notify:(x:string)=>void}) {
  const scrape=async()=>{const url=window.prompt('URL to research with Agent-Reach');if(!url)return;notify('Agent-Reach is scraping...');try{const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Scrape failed');console.log('Agent-Reach result',d.result);notify('Agent-Reach completed. Result logged to the browser console.')}catch(e){notify(e instanceof Error?e.message:'Agent-Reach failed.')}}
  return <div className="sources-grid"><SourceCard icon={GitBranch} name="GitHub Syndicate" type="Repository" detail="Repository credentials are kept server-side. Configure them in deployment settings." onClick={()=>notify('Configure the GitHub source credentials in your deployment environment.')} /><SourceCard icon={HardDrive} name="Google Drive" type="Cloud storage" detail="OAuth flow is implemented; add provider credentials and the callback URL." href="/api/connectors/google" /><SourceCard icon={Network} name="Microsoft Graph" type="Enterprise data" detail="OAuth flow is implemented; add provider credentials and the callback URL." href="/api/connectors/microsoft" /><SourceCard icon={GitCompare} name="Agent-Reach" type="Research / scraping" detail="Run a real scrape through the configured Agent-Reach service. External evidence is kept separate from sales facts." onClick={scrape} actionLabel="Scrape a URL" /></div> }
function SourceCard({icon:Icon,name,type,detail,onClick,href,actionLabel}:{icon:any;name:string;type:string;detail:string;onClick?:()=>void;href?:string;actionLabel?:string}) { return <section className="panel source-card"><div className="source-icon"><Icon/></div><div className="source-title"><h2>{name}</h2><span>{type}</span></div><div className="source-status not-configured"><i/> Configuration required</div><p>{detail}</p>{href?<a className="button secondary full" href={href}>Connect</a>:<button className="button secondary full" onClick={onClick}>{actionLabel??'Configure'}</button>}</section> }

function DatasetView({datasets,analytics,onUpload,onRefresh,onSelect}:{datasets:Dataset[];analytics:Analytics|null;onUpload:()=>void;onRefresh:()=>void;onSelect:(id:string)=>void}) { return <div className="dataset-layout"><section className="panel data-table"><div className="table-toolbar"><div><div className="panel-kicker">CANONICAL DATASETS</div><h2>All datasets <span>{datasets.length}</span></h2></div><div className="toolbar-actions"><button className="button secondary" onClick={onRefresh}><RefreshCw/> Refresh</button><button className="button primary" onClick={onUpload}><Upload/> Import CSV</button></div></div><div className="table-head"><span>Dataset</span><span>Rows</span><span>Status</span><span>Updated</span></div>{datasets.length?datasets.map(d=><button className="dataset-row" key={d.id} onClick={()=>onSelect(d.id)}><strong><Database/>{d.name}</strong><span>{d.row_count.toLocaleString()}</span><span>{d.status}</span><span>{new Date(d.updated_at).toLocaleString()}</span></button>):<Empty icon={Database} text="No datasets yet. Import a CSV to begin."/>}</section><section className="panel dataset-side"><div className="panel-kicker">ACTIVE DATASET</div><h2>{analytics?.dataset.name ?? 'None selected'}</h2><p>{analytics?`${analytics.metrics.rowCount.toLocaleString()} ingested facts. Analytics below are calculated from all fetched rows.`:'Select a ready dataset.'}</p>{analytics&&<div className="pipeline"><div className="done"><i><CheckCircle2/></i><span>INGESTED</span></div><div className="done"><i><CheckCircle2/></i><span>PROFILED</span></div><div className="done"><i><CheckCircle2/></i><span>ANALYZED</span></div></div>}</section></div> }

function Validation({analytics}:{analytics:Analytics|null}) { const score=analytics?Math.max(0,100-(analytics.anomalies.length/Math.max(analytics.metrics.rowCount,1))*100):null; return <div className="quality-layout"><section className="panel issue-table"><PanelHeading kicker="VALIDATION" title="Statistical and ingestion checks"/>{analytics?.anomalies.length?analytics.anomalies.map((a,i)=><div className="activity-row" key={i}><div><strong>Sales outlier</strong><span>{a.period}: {money(a.sales)} (z {a.zScore.toFixed(2)})</span></div><em>warning</em></div>):<Empty icon={ShieldCheck} text="No statistical outliers detected in the selected dataset."/>}</section><section className="panel quality-summary"><div className="panel-kicker">DATA HEALTH</div><div className="big-score">{score==null?'—':score.toFixed(1)}<span>/100</span></div><p>Derived from observed outlier rate; not a fabricated quality claim.</p></section></div> }

function Comparison({analytics,brands,selected,brandIds,setBrandIds,datasetId}:{analytics:Analytics|null;brands:Brand[];selected:any[];brandIds:string[];setBrandIds:(x:string[])=>void;datasetId:string}) {
  const toggle=(id:string)=>setBrandIds(brandIds.includes(id)?brandIds.filter(x=>x!==id):brandIds.length<4?[...brandIds,id]:brandIds)
  const rows=analytics?.comparison?.filter((x:any)=>brandIds.length?brandIds.includes(x.id):true) ?? analytics?.brands.slice(0,8) ?? []
  return <div className="dashboard-grid"><section className="panel"><PanelHeading kicker="BRAND SELECTION" title="Compare up to four brands" action={<span>{brandIds.length}/4 selected</span>}/><div className="brand-picker">{brands.map(b=><button className={`button ${brandIds.includes(b.id)?'primary':'secondary'}`} key={b.id} onClick={()=>toggle(b.id)}>{brandIds.includes(b.id)?'✓ ':''}{b.name}</button>)}</div></section><section className="panel"><PanelHeading kicker="COMPARISON" title="Observed performance" action={<span>Real sales facts</span>}/>{rows.length?<div className="table-head"><span>Brand</span><span>Sales</span><span>Share</span><span>Units</span><span>Growth</span></div>:<Empty icon={GitCompare} text="Select brands to compare."/>}{rows.map((r:any)=><div className="dataset-row" key={r.id}><strong>{r.name}</strong><span>{money(r.sales)}</span><span>{pct(r.marketShare)}</span><span>{money(r.units)}</span><span>{pct(r.latestGrowth)}</span></div>)}</section>{selected.map((b:any)=><section className="panel" key={b.id}><PanelHeading kicker="BRAND DETAIL" title={b.name}/><div className="metric-row"><Metric icon={BarChart3} label="Sales" value={money(b.sales)} delta="Selected dataset"/><Metric icon={Target} label="Market share" value={pct(b.marketShare)} delta="Sales / total sales"/><Metric icon={Activity} label="Period growth" value={pct(b.latestGrowth)} delta="Latest two observed periods"/></div></section>)}</div>
}

function Reports({datasets,datasetId,notify}:{datasets:Dataset[];datasetId:string;notify:(x:string)=>void}) { const [reports,setReports]=useState<any[]>([]); const [name,setName]=useState(''); const load=()=>fetch('/api/reports').then(r=>r.json()).then(d=>setReports(d.reports??[])).catch(()=>{}); useEffect(()=>{load()},[]); const create=async()=>{if(!name.trim())return notify('Enter a report name');const r=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,datasetId})});const d=await r.json();if(!r.ok)return notify(d.error||'Could not create report');setName('');load();notify('Report created')};return <div className="dashboard-grid"><section className="panel"><PanelHeading kicker="REPORT BUILDER" title="Create from verified analytics"/><div className="settings-field"><label>Report name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Brand performance report"/></div><button className="button primary" onClick={create} disabled={!datasetId}><FileBarChart/> Create report</button><p className="muted-copy">Reports are stored in Supabase. Export selected analytics from the Analyst after generation.</p></section><section className="panel"><PanelHeading kicker="REPORT LIBRARY" title={`${reports.length} reports`}/>{reports.length?reports.map(r=><div className="activity-row" key={r.id}><div><strong>{r.name}</strong><span>{new Date(r.created_at).toLocaleString()}</span></div><em>{r.status}</em></div>):<Empty icon={FileText} text="No reports saved yet."/ >}</section></div> }

function Workflows({datasets,datasetId,notify}:{datasets:Dataset[];datasetId:string;notify:(x:string)=>void}) { const [flows,setFlows]=useState<any[]>([]); const load=()=>fetch('/api/workflows').then(r=>r.json()).then(d=>setFlows(d.workflows??[])).catch(()=>{}); useEffect(()=>{load()},[]); const create=async()=>{const r=await fetch('/api/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`CPG ingestion ${new Date().toLocaleDateString()}`})});const d=await r.json();if(!r.ok)return notify(d.error||'Unable to create workflow');load();notify('Workflow created')}; const run=async(id:string)=>{const r=await fetch('/api/workflows/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workflowId:id,datasetId})});const d=await r.json();notify(r.ok?`Workflow ${d.run.status}`:(d.error||'Workflow failed'))}; return <div className="dashboard-grid"><section className="panel"><PanelHeading kicker="AUTOMATION" title="Data-to-insight workflow" action={<button className="button primary" onClick={create}><Plus/> New workflow</button>}/><div className="workflow-steps">{['INGEST','VALIDATE','ANALYZE','REPORT'].map((x,i)=><div className="workflow-step complete" key={x}><div className="step-node">{i+1}</div><span>{x}</span>{i<3&&<i/>}</div>)}</div></section><section className="panel">{flows.length?flows.map(f=><div className="activity-row" key={f.id}><div><strong>{f.name}</strong><span>Stored workflow definition</span></div><button className="button secondary" onClick={()=>run(f.id)} disabled={!datasetId}><Play/> Run</button></div>):<Empty icon={Workflow} text="Create a workflow to run deterministic analysis on a selected dataset."/>}</section></div> }

function Saved() { const [items,setItems]=useState<any[]>([]); const load=()=>fetch('/api/analyses').then(r=>r.json()).then(d=>setItems(d.analyses??[])).catch(()=>{}); useEffect(()=>{load()},[]); const del=async(id:string)=>{await fetch(`/api/analyses?id=${id}`,{method:'DELETE'});load()};return <section className="panel"><PanelHeading kicker="SAVED ANALYSES" title={`${items.length} saved questions`}/>{items.length?items.map(x=><div className="activity-row" key={x.id}><div><strong>{x.prompt}</strong><span>{x.result?.dataset??'Dataset'} · grounding {x.result?.grounding?.score?.toFixed?.(1)??'—'}%</span></div><button className="icon-button" onClick={()=>del(x.id)} aria-label="Delete"><Trash2/></button></div>):<Empty icon={Save} text="Ask the Analyst to create a saved analysis."/>}</section> }

function Settings() { return <div className="settings-layout"><section className="panel settings-content"><div className="panel-kicker">WORKSPACE</div><h2>CPGist AI</h2><p className="muted-copy">Server credentials are intentionally never exposed to the browser. Configure Supabase, Ollama, and optional Agent-Reach variables in your deployment environment.</p><div className="settings-field"><label>AI grounding</label><div className="locked-input"><Target/> Deterministic evidence coverage</div></div><div className="settings-field"><label>Analytics</label><div className="locked-input"><BarChart3/> Calculated from complete paginated fact retrieval</div></div></section></div> }

function UploadModal({onClose,onUpload,uploading}:{onClose:()=>void;onUpload:(f:File,n:string)=>void;uploading:boolean}) { const [name,setName]=useState(''); const [file,setFile]=useState<File|null>(null); const ref=useRef<HTMLInputElement>(null);return <div className="command-backdrop"><div className="panel" style={{width:'min(520px,92vw)',padding:24}}><div className="panel-heading"><div><div className="panel-kicker">INGESTION</div><h2>Import CSV dataset</h2></div><button className="icon-button" onClick={onClose}><X/></button></div><div className="settings-field"><label>Dataset name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Retail Sales Q3"/></div><div className="settings-field"><label>CSV file</label><input ref={ref} type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]??null)}/></div><p className="muted-copy">Expected measures include sales/revenue/value and/or units/volume/quantity. Brand, product, retailer, category and period columns are detected automatically.</p><button className="button primary full" disabled={!file||uploading} onClick={()=>file&&onUpload(file,name)}>{uploading?<><RefreshCw className="spin"/> Importing...</>:<><Upload/> Import and analyze</>}</button></div></div> }
