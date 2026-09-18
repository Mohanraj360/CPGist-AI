import PptxGenJS from 'pptxgenjs'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateAnalytics } from '@/lib/cpg/server-analytics'

type Analytics = Awaited<ReturnType<typeof aggregateAnalytics>>

const palette = {
  navy: '102A43',
  blue: '1677FF',
  teal: '00A6A6',
  ink: '243B53',
  muted: '627D98',
  grid: 'D9E2EC',
  white: 'FFFFFF',
}

function currency(value: number | null) {
  return value == null ? '—' : `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function addHeader(slide: PptxGenJS.Slide, title: string, subtitle: string) {
  slide.background = { color: palette.white }
  slide.addShape(PptxGenJS.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: palette.blue }, line: { color: palette.blue } })
  slide.addText(title, { x: 0.6, y: 0.48, w: 8.8, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: palette.navy, margin: 0 })
  slide.addText(subtitle, { x: 0.6, y: 0.94, w: 11.8, h: 0.24, fontSize: 9, color: palette.muted, margin: 0 })
}

function addMetric(slide: PptxGenJS.Slide, label: string, value: string, x: number) {
  slide.addText(label.toUpperCase(), { x, y: 1.45, w: 2.25, h: 0.18, fontSize: 8, bold: true, color: palette.muted, margin: 0 })
  slide.addText(value, { x, y: 1.7, w: 2.25, h: 0.42, fontSize: 20, bold: true, color: palette.navy, margin: 0 })
}

function safeFilename(name: string) {
  return `${name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'cpgist'}-report.pptx`
}

export async function GET(request: Request) {
  const datasetId = new URL(request.url).searchParams.get('datasetId')
  if (!datasetId) return NextResponse.json({ error: 'datasetId is required.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in is required.' }, { status: 401 })

  const { data: dataset, error: datasetError } = await supabase.from('datasets').select('id,name').eq('id', datasetId).single()
  if (datasetError || !dataset) return NextResponse.json({ error: 'Dataset not found.' }, { status: 404 })

  let analytics: Analytics
  try {
    analytics = await aggregateAnalytics(supabase, datasetId)
  } catch {
    return NextResponse.json({ error: 'Unable to calculate report metrics.' }, { status: 500 })
  }

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'CPGist AI'
  pptx.subject = `Dataset report for ${dataset.name}`
  pptx.title = `${dataset.name} report`
  pptx.company = 'CPGist AI'
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' }

  const overview = pptx.addSlide()
  addHeader(overview, dataset.name, 'Executive performance report generated from the selected Supabase dataset')
  addMetric(overview, 'Rows analyzed', analytics.metrics.rowCount.toLocaleString(), 0.6)
  addMetric(overview, 'Total sales', currency(analytics.metrics.sales), 3.2)
  addMetric(overview, 'Total units', analytics.metrics.units.toLocaleString(), 5.8)
  addMetric(overview, 'Average price', currency(analytics.metrics.averagePrice), 8.4)
  overview.addText('Dataset coverage', { x: 0.6, y: 2.55, w: 2.5, h: 0.25, fontSize: 13, bold: true, color: palette.ink, margin: 0 })
  overview.addText(`Promotion rate: ${analytics.metrics.promotionRate == null ? '—' : `${analytics.metrics.promotionRate.toFixed(1)}%`}\nAverage distribution: ${analytics.metrics.averageDistribution == null ? '—' : `${analytics.metrics.averageDistribution.toFixed(1)}%`}\nPeriods: ${analytics.trend.length ? `${analytics.trend[0].period} – ${analytics.trend.at(-1)?.period}` : 'No dated observations'}`, { x: 0.6, y: 2.95, w: 5.1, h: 1.1, fontSize: 14, color: palette.ink, breakLine: false, margin: 0.04, valign: 'middle' })
  overview.addText('Top brands by sales', { x: 6.8, y: 2.55, w: 3, h: 0.25, fontSize: 13, bold: true, color: palette.ink, margin: 0 })
  overview.addChart(pptx.ChartType.bar, [{ name: 'Sales', labels: analytics.brands.slice(0, 6).map((brand) => brand.name), values: analytics.brands.slice(0, 6).map((brand) => brand.sales) }], { x: 6.8, y: 2.9, w: 5.8, h: 3.45, catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, showLegend: false, showTitle: false, showValue: true, chartColors: [palette.blue], valGridLine: { color: palette.grid }, catAxisLabelColor: palette.ink, valAxisLabelColor: palette.muted })

  const trend = pptx.addSlide()
  addHeader(trend, 'Sales trend', 'Aggregated sales and unit performance by period')
  trend.addChart(pptx.ChartType.line, [
    { name: 'Sales', labels: analytics.trend.map((item) => item.period), values: analytics.trend.map((item) => item.sales) },
    { name: 'Units', labels: analytics.trend.map((item) => item.period), values: analytics.trend.map((item) => item.units) },
  ], { x: 0.65, y: 1.45, w: 12, h: 5.2, showLegend: true, legendPos: 'b', catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, chartColors: [palette.blue, palette.teal], valGridLine: { color: palette.grid }, showTitle: false, showValue: false, lineSize: 2 })

  const brands = pptx.addSlide()
  addHeader(brands, 'Brand performance', 'Ranked sales contribution and market share from the same dataset scope')
  brands.addChart(pptx.ChartType.bar, [{ name: 'Sales', labels: analytics.brands.slice(0, 10).map((brand) => brand.name), values: analytics.brands.slice(0, 10).map((brand) => brand.sales) }], { x: 0.65, y: 1.4, w: 7.2, h: 5.35, showLegend: false, showValue: true, chartColors: [palette.blue], catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, valGridLine: { color: palette.grid } })
  brands.addText('Market share', { x: 8.3, y: 1.48, w: 2, h: 0.25, fontSize: 13, bold: true, color: palette.ink, margin: 0 })
  brands.addTable(analytics.brands.slice(0, 10).map((brand) => [{ text: brand.name }, { text: brand.marketShare == null ? '—' : `${brand.marketShare.toFixed(1)}%` }]), { x: 8.3, y: 1.9, w: 4.4, h: 4.5, border: { type: 'solid', pt: 0.5, color: palette.grid }, fontSize: 10, color: palette.ink, margin: 0.08, rowH: 0.38, fill: { color: palette.white } })

  const evidence = pptx.addSlide()
  addHeader(evidence, 'Evidence and data lineage', 'Every value in this report is calculated from the selected dataset')
  evidence.addText('Source dataset', { x: 0.7, y: 1.55, w: 2.4, h: 0.25, fontSize: 12, bold: true, color: palette.muted, margin: 0 })
  evidence.addText(dataset.name, { x: 0.7, y: 1.9, w: 11.7, h: 0.4, fontSize: 22, bold: true, color: palette.navy, margin: 0 })
  evidence.addText(`Dataset ID: ${dataset.id}\nRows included: ${analytics.metrics.rowCount.toLocaleString()}\nTrend periods: ${analytics.trend.length}\nBrands ranked: ${analytics.brands.length}\nAnomalies detected: ${analytics.anomalies.length}\n\nMetric definitions\nAverage price = sales ÷ units. Market share uses the available dataset/category denominator. Distribution excludes null observations.`, { x: 0.7, y: 2.7, w: 11.4, h: 2.6, fontSize: 14, color: palette.ink, breakLine: false, margin: 0.04, valign: 'middle' })

  const buffer = await pptx.write({ outputType: 'nodebuffer' })
  return new NextResponse(buffer as Buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Content-Disposition': `attachment; filename="${safeFilename(dataset.name)}"`, 'Cache-Control': 'no-store' } })
}
