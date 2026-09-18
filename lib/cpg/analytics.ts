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
  const valid = records.filter((record) => Number.isFinite(record.sales) && Number.isFinite(record.units) && record.units > 0)
  const units = sumBy(valid, (record) => record.units)
  if (units <= 0) return null
  return sumBy(valid, (record) => record.sales) / units
}

export function calculatePromoLift(records: SalesRecord[]) {
  const promoted = records.filter((record) => record.onPromo === true)
  const baseline = records.filter((record) => record.onPromo === false)
  const promotedAverage = calculateAveragePrice(promoted)
  const baselineAverage = calculateAveragePrice(baseline)
  if (promotedAverage === null || baselineAverage === null || baselineAverage === 0) return null
  return ((promotedAverage - baselineAverage) / Math.abs(baselineAverage)) * 100
}

export function calculatePriceChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function calculateIncrementalSales(records: SalesRecord[]) {
  const promoted = records.filter((record) => record.onPromo === true)
  const baseline = records.filter((record) => record.onPromo === false)
  const baselineUnitsPerRecord = baseline.length ? sumBy(baseline, (record) => record.units) / baseline.length : null
  if (baselineUnitsPerRecord === null || !promoted.length) return null
  return sumBy(promoted, (record) => record.units) - baselineUnitsPerRecord * promoted.length
}

export function calculateContribution(entitySales: number, totalSales: number) {
  if (!Number.isFinite(entitySales) || !Number.isFinite(totalSales) || totalSales <= 0) return null
  return (entitySales / totalSales) * 100
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
