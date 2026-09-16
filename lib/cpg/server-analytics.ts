import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateGrowth, calculateMarketShare } from './analytics'

export type Fact = {
  period: string | null
  category: string | null
  brand_id?: string | null
  retailer_id?: string | null
  product_id?: string | null
  sales: number | null
  units: number | null
  distribution: number | null
  price: number | null
  on_promo: boolean | null
}

type AggregateGroup = { key: string; sales: number; units: number; rows: number }

async function fetchAll<T>(queryFactory: (from: number, to: number) => any, batchSize = 1000): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await queryFactory(from, from + batchSize - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < batchSize) break
  }
  return all
}

export async function fetchFacts(supabase: SupabaseClient, datasetId: string) {
  return fetchAll<Fact>((from, to) =>
    supabase.from('sales_facts')
      .select('period,category,brand_id,retailer_id,product_id,sales,units,distribution,price,on_promo')
      .eq('dataset_id', datasetId)
      .order('period', { ascending: true, nullsFirst: true })
      .range(from, to)
  )
}

async function fetchNames(supabase: SupabaseClient, table: 'brands' | 'retailers' | 'products', datasetId: string) {
  const rows = await fetchAll<{ id: string; name: string }>((from, to) =>
    supabase.from(table).select('id,name').eq('dataset_id', datasetId).order('name').range(from, to)
  )
  return new Map(rows.map((row) => [row.id, row.name]))
}

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

export async function queryMetrics(supabase: SupabaseClient, datasetId: string) {
  const facts = await fetchFacts(supabase, datasetId)
  return metricsFromFacts(facts)
}

export function metricsFromFacts(facts: Fact[]) {
  const sales = facts.reduce((sum, row) => sum + (Number(row.sales) || 0), 0)
  const units = facts.reduce((sum, row) => sum + (Number(row.units) || 0), 0)
  const promoRows = facts.filter((row) => row.on_promo === true)
  const avgDistributionRows = facts.filter((row) => Number.isFinite(Number(row.distribution)))
  const averageDistribution = avgDistributionRows.length
    ? avgDistributionRows.reduce((sum, row) => sum + Number(row.distribution), 0) / avgDistributionRows.length
    : null
  return {
    rowCount: facts.length,
    sales,
    units,
    averagePrice: units ? sales / units : null,
    promotionRate: facts.length ? (promoRows.length / facts.length) * 100 : null,
    averageDistribution,
  }
}

export async function aggregateAnalytics(supabase: SupabaseClient, datasetId: string) {
  const facts = await fetchFacts(supabase, datasetId)
  const [brands, retailers, anomalies] = await Promise.all([
    fetchNames(supabase, 'brands', datasetId),
    fetchNames(supabase, 'retailers', datasetId),
    detectAnomaliesFromFacts(facts),
  ])
  const totalSales = facts.reduce((sum, fact) => sum + (Number(fact.sales) || 0), 0)
  const summarize = (select: (fact: Fact) => string | null | undefined, names?: Map<string, string>) =>
    aggregateBy(facts, select).map(({ key, ...value }) => ({
      id: key,
      name: names?.get(key) ?? key,
      ...value,
      marketShare: calculateMarketShare(value.sales, totalSales),
    }))

  return {
    metrics: metricsFromFacts(facts),
    trend: trendFor(facts),
    categories: summarize((fact) => fact.category),
    brands: summarize((fact) => fact.brand_id, brands),
    retailers: summarize((fact) => fact.retailer_id, retailers),
    anomalies,
  }
}

export async function brandComparison(supabase: SupabaseClient, datasetId: string, brandIds?: string[]) {
  const facts = await fetchFacts(supabase, datasetId)
  const brands = await fetchNames(supabase, 'brands', datasetId)
  const selected = brandIds?.filter(Boolean) ?? []
  const ids = selected.length ? selected : [...new Set(facts.map((f) => f.brand_id).filter(Boolean) as string[])].slice(0, 8)
  const totalSales = facts.reduce((sum, f) => sum + (Number(f.sales) || 0), 0)
  const rows = ids.map((id) => {
    const own = facts.filter((f) => f.brand_id === id)
    const metrics = metricsFromFacts(own)
    const trend = trendFor(own)
    const previous = trend.length > 1 ? trend[trend.length - 2].sales : null
    const current = trend.length ? trend[trend.length - 1].sales : 0
    return {
      id,
      name: brands.get(id) ?? id,
      ...metrics,
      marketShare: calculateMarketShare(metrics.sales, totalSales),
      latestPeriod: trend.at(-1)?.period ?? null,
      latestGrowth: previous === null ? null : calculateGrowth(current, previous),
      trend,
    }
  })
  return rows.sort((a, b) => b.sales - a.sales)
}

export async function brandDetail(supabase: SupabaseClient, datasetId: string, brandId: string) {
  const facts = await fetchFacts(supabase, datasetId)
  const brands = await fetchNames(supabase, 'brands', datasetId)
  const own = facts.filter((f) => f.brand_id === brandId)
  if (!own.length) return null
  const totalSales = facts.reduce((sum, f) => sum + (Number(f.sales) || 0), 0)
  const trend = trendFor(own)
  const categories = aggregateBy(own, (f) => f.category).map(({ key, ...value }) => ({ name: key, ...value }))
  return {
    id: brandId,
    name: brands.get(brandId) ?? brandId,
    metrics: { ...metricsFromFacts(own), marketShare: calculateMarketShare(metricsFromFacts(own).sales, totalSales) },
    trend,
    categories,
    anomalies: await detectAnomaliesFromFacts(own),
  }
}

export async function detectAnomalies(supabase: SupabaseClient, datasetId: string) {
  return detectAnomaliesFromFacts(await fetchFacts(supabase, datasetId))
}

export function detectAnomaliesFromFacts(facts: Fact[]) {
  const values = facts.map((row) => Number(row.sales) || 0)
  if (values.length < 3) return []
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const deviation = Math.sqrt(variance)
  if (!deviation) return []
  return facts
    .filter((row) => row.period && Math.abs((Number(row.sales) || 0) - mean) > deviation * 2)
    .map((row) => ({
      period: row.period,
      sales: Number(row.sales) || 0,
      zScore: ((Number(row.sales) || 0) - mean) / deviation,
    }))
}

export { calculateGrowth }
