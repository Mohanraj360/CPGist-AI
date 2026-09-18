import type { Fact } from './server-analytics'
import { calculateGrowth, calculateMarketShare } from './analytics'

export type Opportunity = {
  type: 'distribution' | 'promotion' | 'price' | 'share' | 'growth'
  priority: 'high' | 'medium'
  title: string
  evidence: string
}

export function detectOpportunities(rows: Fact[]): Opportunity[] {
  if (!rows.length) return []
  const opportunities: Opportunity[] = []
  const distribution = rows.filter((r) => Number.isFinite(Number(r.distribution))).map((r) => Number(r.distribution))
  const averageDistribution = distribution.length ? distribution.reduce((a, b) => a + b, 0) / distribution.length : null
  if (averageDistribution !== null && averageDistribution < 60) {
    opportunities.push({ type: 'distribution', priority: 'high', title: 'Distribution expansion opportunity', evidence: `Average observed distribution is ${averageDistribution.toFixed(1)}%.` })
  }
  const promoRate = rows.filter((r) => r.on_promo === true).length / rows.length * 100
  if (promoRate < 20) {
    opportunities.push({ type: 'promotion', priority: 'medium', title: 'Promotion coverage is limited', evidence: `Only ${promoRate.toFixed(1)}% of observed rows are marked on promotion.` })
  }
  const byPeriod = new Map<string, number>()
  for (const row of rows) if (row.period) byPeriod.set(row.period, (byPeriod.get(row.period) ?? 0) + (Number(row.sales) || 0))
  const periods = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b))
  if (periods.length >= 2) {
    const growth = calculateGrowth(periods.at(-1)![1], periods.at(-2)![1])
    if (growth !== null && growth < -5) opportunities.push({ type: 'growth', priority: 'high', title: 'Recent sales decline detected', evidence: `Latest period sales changed ${growth.toFixed(1)}% versus the prior period.` })
  }
  return opportunities
}

export function buildScenario(rows: Fact[], priceChangePct: number, elasticity = -1) {
  const sales = rows.reduce((s, r) => s + (Number(r.sales) || 0), 0)
  const units = rows.reduce((s, r) => s + (Number(r.units) || 0), 0)
  if (units <= 0) return { currentSales: sales, estimatedUnits: null, estimatedSales: null, salesImpactPct: null }
  const currentPrice = sales / units
  const estimatedUnits = units * (1 + (priceChangePct / 100) * elasticity)
  const estimatedPrice = currentPrice * (1 + priceChangePct / 100)
  const estimatedSales = estimatedUnits * estimatedPrice
  return { currentSales: sales, currentPrice, estimatedUnits, estimatedPrice, estimatedSales, salesImpactPct: sales ? ((estimatedSales - sales) / sales) * 100 : null }
}

export function summarizeShare(entitySales: number, totalSales: number) {
  return calculateMarketShare(entitySales, totalSales)
}
