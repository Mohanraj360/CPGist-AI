import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateGrowth, calculateMarketShare } from './analytics'

type Fact = { period: string | null; category: string | null; brand_id?: string | null; retailer_id?: string | null; sales: number | null; units: number | null; distribution: number | null; price: number | null; on_promo: boolean | null }

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

export async function queryMetrics(supabase: SupabaseClient, datasetId: string) {
  const { data, error } = await supabase.from('sales_facts').select('period,category,sales,units,distribution,price,on_promo').eq('dataset_id', datasetId).order('period')
  if (error) throw error
  const facts = (data ?? []) as Fact[]
  const sales = facts.reduce((sum, row) => sum + (Number(row.sales) || 0), 0)
  const units = facts.reduce((sum, row) => sum + (Number(row.units) || 0), 0)
  const promoRows = facts.filter((row) => row.on_promo === true)
  return { rowCount: facts.length, sales, units, averagePrice: units ? sales / units : null, promotionRate: facts.length ? promoRows.length / facts.length * 100 : null }
}

export async function categoryPerformance(supabase: SupabaseClient, datasetId: string) {
  const { data, error } = await supabase.from('sales_facts').select('category,sales,units').eq('dataset_id', datasetId)
  if (error) throw error
  const facts = (data ?? []) as Fact[]
  const groups = aggregateBy(facts, (fact) => fact.category)
  const total = groups.reduce((sum, value) => sum + value.sales, 0)
  return groups.map(({ key, ...value }) => ({ category: key, ...value, marketShare: calculateMarketShare(value.sales, total) }))
}

export async function aggregateAnalytics(supabase: SupabaseClient, datasetId: string) {
  const { data, error } = await supabase.from('sales_facts').select('period,category,brand_id,retailer_id,sales,units,distribution,price,on_promo').eq('dataset_id', datasetId).order('period')
  if (error) throw error
  const facts = (data ?? []) as Fact[]
  const [metrics, anomalies] = await Promise.all([queryMetrics(supabase, datasetId), detectAnomalies(supabase, datasetId)])
  const trend = facts.reduce<Array<{ period: string; sales: number; units: number }>>((rows, fact) => {
    if (!fact.period) return rows
    const current = rows.find((row) => row.period === fact.period)
    if (current) { current.sales += Number(fact.sales) || 0; current.units += Number(fact.units) || 0 } else rows.push({ period: fact.period, sales: Number(fact.sales) || 0, units: Number(fact.units) || 0 })
    return rows
  }, [])
  const totalSales = facts.reduce((sum, fact) => sum + (Number(fact.sales) || 0), 0)
  const summarize = (select: (fact: Fact) => string | null | undefined) => aggregateBy(facts, select).map(({ key, ...value }) => ({ name: key, ...value, marketShare: calculateMarketShare(value.sales, totalSales) }))
  return { metrics, trend, categories: summarize((fact) => fact.category), brands: summarize((fact) => fact.brand_id), retailers: summarize((fact) => fact.retailer_id), anomalies }
}

export async function detectAnomalies(supabase: SupabaseClient, datasetId: string) {
  const { data, error } = await supabase.from('sales_facts').select('period,sales').eq('dataset_id', datasetId).order('period')
  if (error) throw error
  const values = (data ?? []).map((row) => Number(row.sales) || 0); const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0; const deviation = Math.sqrt(variance)
  return (data ?? []).filter((row) => deviation > 0 && Math.abs((Number(row.sales) || 0) - mean) > deviation * 2).map((row) => ({ period: row.period, sales: Number(row.sales) || 0, zScore: (Number(row.sales) - mean) / deviation }))
}

export { calculateGrowth }
