import { describe, expect, it } from 'vitest'
import { calculateGrowth, calculateMarketShare, calculatePromoLift, calculateIncrementalSales } from './analytics'

describe('canonical CPG metrics', () => {
  it('returns null for an unavailable growth denominator', () => {
    expect(calculateGrowth(10, 0)).toBeNull()
  })
  it('calculates market share against the matching market total', () => {
    expect(calculateMarketShare(25, 100)).toBe(25)
  })
  it('requires an observed non-promo baseline for promotion lift', () => {
    expect(calculatePromoLift([{ period: '2026-01', sales: 100, units: 10, onPromo: true }])).toBeNull()
    expect(calculatePromoLift([
      { period: '2026-01', sales: 100, units: 10, onPromo: false },
      { period: '2026-02', sales: 150, units: 20, onPromo: true },
    ])).toBe(-25)
  })
  it('calculates incremental units from the observed baseline', () => {
    expect(calculateIncrementalSales([
      { period: '2026-01', sales: 100, units: 10, onPromo: false },
      { period: '2026-02', sales: 150, units: 20, onPromo: true },
    ])).toBe(10)
  })
})
