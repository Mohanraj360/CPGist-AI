export type SalesRecord = {
  period: string
  sales: number
  units: number
  distribution?: number
  price?: number
  onPromo?: boolean
}

export function sumBy<T>(records: T[], select: (record: T) => number) {
  return records.reduce((total, record) => total + (Number.isFinite(select(record)) ? select(record) : 0), 0)
}

export function calculateGrowth(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function calculateMarketShare(entitySales: number, marketSales: number) {
  if (!Number.isFinite(marketSales) || marketSales <= 0) return null
  return (entitySales / marketSales) * 100
}

export function calculatePromotionRate(records: SalesRecord[]) {
  if (!records.length) return null
  return (records.filter((record) => record.onPromo === true).length / records.length) * 100
}

export function calculateAveragePrice(records: SalesRecord[]) {
  const units = sumBy(records, (record) => record.units)
  if (units <= 0) return null
  return sumBy(records, (record) => record.sales) / units
}

export function generateTrend(records: SalesRecord[]) {
  return records.map((record) => ({
    period: record.period,
    sales: record.sales,
    units: record.units,
    distribution: record.distribution ?? null,
    price: record.price ?? (record.units > 0 ? record.sales / record.units : null),
  }))
}
