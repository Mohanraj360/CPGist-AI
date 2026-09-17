export const DEMO_DATASET_ID = 'demo-local'

const periods = ['2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26']
const brands = [
  { id: 'demo-brand-1', name: 'Apex Foods' },
  { id: 'demo-brand-2', name: 'FreshField' },
  { id: 'demo-brand-3', name: 'Urban Harvest' },
]
const retailers = [
  { id: 'demo-retailer-1', name: 'QuickCart' },
  { id: 'demo-retailer-2', name: 'DailyMart' },
]
const matrix = [[12000, 13200, 14100, 15000], [9800, 10200, 11100, 10900], [7600, 8200, 8700, 9300]]

export function getDemoDataset() {
  return { id: DEMO_DATASET_ID, name: 'CPGist Demo Retail Sales', source: 'Built-in synthetic demo', status: 'ready', row_count: 24, updated_at: new Date().toISOString() }
}

export function getDemoAnalytics() {
  const trend = periods.map((period, i) => {
    const sales = matrix.reduce((sum, row) => sum + row[i], 0)
    const units = matrix.reduce((sum, row, b) => sum + Math.round(row[i] / (5.5 + b * .7)), 0)
    return { period, sales, units }
  })
  const totalSales = trend.reduce((s, x) => s + x.sales, 0)
  const totalUnits = trend.reduce((s, x) => s + x.units, 0)
  const brandRows = brands.map((brand, b) => {
    const sales = matrix[b].reduce((s, x) => s + x, 0)
    const units = matrix[b].reduce((s, x) => s + Math.round(x / (5.5 + b * .7)), 0)
    return { id: brand.id, name: brand.name, sales, units, rows: 8, marketShare: totalSales ? sales / totalSales * 100 : 0, latestGrowth: matrix[b][3] / matrix[b][2] * 100 - 100 }
  })
  return {
    dataset: getDemoDataset(),
    metrics: { rowCount: 24, sales: totalSales, units: totalUnits, averagePrice: totalUnits ? totalSales / totalUnits : null, promotionRate: 50, averageDistribution: 82 },
    trend,
    categories: [{ id: 'demo-category-1', name: 'Snacks', sales: totalSales, units: totalUnits, rows: 24, marketShare: 100 }],
    brands: brandRows,
    retailers: retailers.map((r, i) => {
      const sales = matrix.reduce((s, row) => s + row.reduce((ss, x, p) => ss + (p % 2 === i ? x : 0), 0), 0)
      const units = matrix.reduce((s, row, b) => s + row.reduce((ss, x, p) => ss + (p % 2 === i ? Math.round(x / (5.5 + b * .7)) : 0), 0), 0)
      return { id: r.id, name: r.name, sales, units, rows: 12, marketShare: totalSales ? sales / totalSales * 100 : 0 }
    }),
    anomalies: [{ period: '2026-07-26', sales: trend[3].sales, zScore: 1.18 }],
    comparison: brandRows,
    generatedAt: new Date().toISOString(),
  }
}

export function demoEvidence() {
  const a = getDemoAnalytics()
  return {
    metrics: a.metrics,
    trend: a.trend,
    categories: a.categories,
    brands: a.brands,
    retailers: a.retailers,
    anomalies: a.anomalies,
  }
}
