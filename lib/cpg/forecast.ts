export type ForecastPoint = { period: string; sales: number; forecast: boolean }

/** Baseline forecast: weighted moving average. Designed as a transparent MVP model. */
export function forecastSales(history: { period: string; sales: number }[], horizon = 4, window = 4): ForecastPoint[] {
  const clean = history.filter((x) => Number.isFinite(x.sales)).sort((a, b) => a.period.localeCompare(b.period))
  if (!clean.length || horizon < 1) return []
  const values = clean.map((x) => x.sales)
  const result = clean.map((x) => ({ ...x, forecast: false }))
  let working = [...values]
  for (let i = 0; i < horizon; i++) {
    const sample = working.slice(-Math.max(1, window))
    const forecast = sample.reduce((s, v) => s + v, 0) / sample.length
    result.push({ period: `Forecast ${i + 1}`, sales: forecast, forecast: true })
    working.push(forecast)
  }
  return result
}
