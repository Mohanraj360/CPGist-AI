import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

function escXml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
function col(n: number) { let s = ''; for (; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
function sheetXml(rows: string[][]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>`<c r="${col(ci)}${ri+1}" t="inlineStr"><is><t>${escXml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
}
function pptLikeCsv(a: Awaited<ReturnType<typeof aggregateAnalytics>>, name: string) {
  const rows = [
    ['CPGist AI Report', name],
    ['Metric', 'Value'],
    ['Rows', String(a.metrics.rowCount)], ['Sales', String(a.metrics.sales)], ['Units', String(a.metrics.units)], ['Average distribution', String(a.metrics.averageDistribution ?? '')],
    [], ['Brand', 'Sales', 'Units', 'Market share %'],
    ...a.brands.map(b => [b.name, String(b.sales), String(b.units), String(b.marketShare ?? '')]),
    [], ['Period', 'Sales', 'Units'], ...a.trend.map(t => [t.period, String(t.sales), String(t.units)])
  ]
  return rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
}

export async function GET(request: Request) {
  const datasetId = new URL(request.url).searchParams.get('datasetId')
  if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })
  const { data: dataset } = await supabase.from('datasets').select('id,name').eq('id', datasetId).single()
  if (!dataset) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })
  const a = await aggregateAnalytics(supabase, datasetId)
  const body = pptLikeCsv(a, dataset.name)
  return new NextResponse(body, { headers: { 'Content-Type': 'application/vnd.ms-powerpoint; charset=utf-8', 'Content-Disposition': `attachment; filename="${dataset.name.replace(/[^a-z0-9-_]+/gi,'-')}-report.ppt"`, 'Cache-Control': 'no-store' } })
}
