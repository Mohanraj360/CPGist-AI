import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateGrowth, calculateMarketShare } from './analytics'

export type Fact = {
  period: string | null
  category: string | null
  brand_id?: string | number | null
  retailer_id?: string | number | null
  product_id?: string | number | null
  sales: number | null
  units: number | null
  distribution: number | null
  price: number | null
  on_promo: boolean | null
}

type AggregateGroup = { key: string; sales: number; units: number; rows: number }

function aggregateBy(facts: Fact[], select: (fact: Fact) => string | null | undefined) {
  const groups = new Map<string, AggregateGroup>()
  for (const fact of facts) {
    const key = select(fact) || 'Uncategorized'
    const current = groups.get(key) ?? { key, sales: 0, units: 0, rows: 0 }
    current.sales += Number(fact.sales) || 0
    current.units += Number(fact.units) || 0
    current.rows += 1
    groups.set(key, current)
  }
  return [...groups.values()].sort((a, b) => b.sales - a.sales)
}

function trendFor(facts: Fact[]) {
  const map = new Map<string, { period: string; sales: number; units: number }>()
  for (const fact of facts) {
    if (!fact.period) continue
    const current = map.get(fact.period) ?? { period: fact.period, sales: 0, units: 0 }
    current.sales += Number(fact.sales) || 0
    current.units += Number(fact.units) || 0
    map.set(fact.period, current)
  }
  return [...map.values()].sort((a, b) => a.period.localeCompare(b.period))
}

/** Small-data helper retained for filtered drilldowns and unit tests. */
export function metricsFromFacts(facts: Fact[]) {
  const sales = facts.reduce((sum, row) => sum + (Number(row.sales) || 0), 0)
  const units = facts.reduce((sum, row) => sum + (Number(row.units) || 0), 0)
  const promoRows = facts.filter((row) => row.on_promo === true)
  const distributionRows = facts.filter((row) => Number.isFinite(Number(row.distribution)))
  return {
    rowCount: facts.length,
    sales,
    units,
    averagePrice: units ? sales / units : null,
    promotionRate: facts.length ? (promoRows.length / facts.length) * 100 : null,
    averageDistribution: distributionRows.length
      ? distributionRows.reduce((sum, row) => sum + Number(row.distribution), 0) / distributionRows.length
      : null,
  }
}

type RpcAnalytics = {
  metrics?: Record<string, unknown>
  trend?: unknown[]
  categories?: unknown[]
  brands?: unknown[]
  retailers?: unknown[]
  promo?: Record<string, unknown>
  elasticity?: Record<string, unknown>
  competitiveSignals?: unknown[]
  brandRelationships?: unknown[]
  distributionWhitespace?: unknown[]
  anomalies?: unknown[]
  lineage?: Record<string, unknown>
}

function normaliseRpcAnalytics(payload: RpcAnalytics | null) {
  if (!payload?.metrics) throw new Error('The CPG analytics database function returned no metrics.')
  const m = payload.metrics
  return {
    metrics: {
      rowCount: Number(m.rowCount ?? 0),
      sales: Number(m.sales ?? 0),
      units: Number(m.units ?? 0),
      averagePrice: m.averagePrice == null ? null : Number(m.averagePrice),
      promotionRate: m.promotionRate == null ? null : Number(m.promotionRate),
      averageDistribution: m.averageDistribution == null ? null : Number(m.averageDistribution),
      minPeriod: m.minPeriod ?? null,
      maxPeriod: m.maxPeriod ?? null,
    },
    trend: payload.trend ?? [],
    categories: payload.categories ?? [],
    brands: payload.brands ?? [],
    retailers: payload.retailers ?? [],
    promo: payload.promo ?? {},
    elasticity: payload.elasticity ?? {},
    competitiveSignals: payload.competitiveSignals ?? [],
    brandRelationships: payload.brandRelationships ?? [],
    distributionWhitespace: payload.distributionWhitespace ?? [],
    anomalies: payload.anomalies ?? [],
    lineage: payload.lineage ?? {},
  }
}

export async function aggregateAnalytics(supabase: SupabaseClient, datasetId: string) {
  const { data, error } = await supabase.rpc('cpgist_dataset_analytics', { p_dataset_id: Number(datasetId) })
  if (error) throw new Error(`Unable to calculate CPG analytics: ${error.message}`)
  return normaliseRpcAnalytics(data as RpcAnalytics)
}

export async function queryMetrics(supabase: SupabaseClient, datasetId: string) {
  return (await aggregateAnalytics(supabase, datasetId)).metrics
}

/** Selected-brand detail is bounded so drilldowns cannot accidentally pull the entire fact table. */
export async function brandDetail(supabase: SupabaseClient, datasetId: string, brandId: string) {
  const { data, error } = await supabase
    .from('sales_facts')
    .select('period,category,brand_id,retailer_id,product_id,sales,units,distribution,price,on_promo')
    .eq('dataset_id', Number(datasetId))
    .eq('brand_id', Number(brandId))
    .order('period', { ascending: true })
    .limit(100000)
  if (error) throw error
  const own = (data ?? []) as Fact[]
  if (!own.length) return null
  const total = await queryMetrics(supabase, datasetId)
  const ownMetrics = metricsFromFacts(own)
  return {
    id: brandId,
    name: brandId,
    metrics: { ...ownMetrics, marketShare: total.sales > 0 ? calculateMarketShare(ownMetrics.sales, total.sales) : null },
    trend: trendFor(own),
    categories: aggregateBy(own, (f) => f.category).map(({ key, ...value }) => ({ name: key, ...value })),
    anomalies: detectAnomaliesFromFacts(own),
  }
}

export async function brandComparison(supabase: SupabaseClient, datasetId: string, brandIds?: string[]) {
  const analytics = await aggregateAnalytics(supabase, datasetId)
  const selected = new Set((brandIds ?? []).filter(Boolean))
  return (analytics.brands as Array<Record<string, unknown>>)
    .filter((row) => !selected.size || selected.has(String(row.id)))
    .slice(0, selected.size ? selected.size : 8)
}

export async function detectAnomalies(supabase: SupabaseClient, datasetId: string) {
  return (await aggregateAnalytics(supabase, datasetId)).anomalies
}

export function detectAnomaliesFromFacts(facts: Fact[]) {
  const values = facts.map((row) => Number(row.sales) || 0)
  if (values.length < 3) return []
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
  if (!deviation) return []
  return facts
    .filter((row) => row.period && Math.abs((Number(row.sales) || 0) - mean) > deviation * 2)
    .map((row) => ({ period: row.period, sales: Number(row.sales) || 0, zScore: ((Number(row.sales) || 0) - mean) / deviation }))
    .slice(0, 20)
}

export { calculateGrowth }
