import { calculateGrowth, calculateMarketShare } from './analytics'
import type { Fact } from './server-analytics'

export type MetricResult = {
  sales: number
  units: number
  averagePrice: number | null
  averageDistribution: number | null
  promotionRate: number | null
  marketShare: number | null
  growth: number | null
  incrementalSales: number | null
  promoLift: number | null
}

function sum(rows: Fact[], field: 'sales' | 'units') {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0)
}

export function calculateMetricSet(rows: Fact[], marketSales?: number, previousRows?: Fact[]): MetricResult {
  const sales = sum(rows, 'sales')
  const units = sum(rows, 'units')
  const previousSales = previousRows ? sum(previousRows, 'sales') : null
  const promo = rows.filter((row) => row.on_promo === true)
  const nonPromo = rows.filter((row) => row.on_promo === false)
  const distributionRows = rows.filter((row) => Number.isFinite(Number(row.distribution)))
  const averageDistribution = distributionRows.length
    ? distributionRows.reduce((total, row) => total + Number(row.distribution), 0) / distributionRows.length
    : null
  const promoSales = sum(promo, 'sales')
  const baseSales = sum(nonPromo, 'sales')
  const incrementalSales = promo.length && nonPromo.length ? promoSales - baseSales * (promo.length / nonPromo.length) : null

  return {
    sales,
    units,
    averagePrice: units > 0 ? sales / units : null,
    averageDistribution,
    promotionRate: rows.length ? (promo.length / rows.length) * 100 : null,
    marketShare: marketSales && marketSales > 0 ? calculateMarketShare(sales, marketSales) : null,
    growth: previousSales !== null ? calculateGrowth(sales, previousSales) : null,
    incrementalSales,
    promoLift: incrementalSales !== null && baseSales > 0 ? (incrementalSales / baseSales) * 100 : null,
  }
}

export function calculateContribution(entityGrowth: number | null, entitySales: number, totalSales: number) {
  if (entityGrowth === null || totalSales <= 0) return null
  return entityGrowth * (entitySales / totalSales)
}
