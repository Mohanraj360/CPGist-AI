export const CPG_DIMENSIONS = [
  'market',
  'category',
  'subcategory',
  'brand',
  'product',
  'retailer',
  'channel',
  'region',
  'store',
  'consumer',
  'shopper',
  'time',
] as const

export const CPG_METRICS = [
  'sales',
  'units',
  'growth',
  'market_share',
  'velocity',
  'price',
  'distribution',
  'promotion_rate',
  'incremental_sales',
  'promo_lift',
  'contribution',
] as const

export type CpgDimension = (typeof CPG_DIMENSIONS)[number]
export type CpgMetric = (typeof CPG_METRICS)[number]

export type CpgIntent = 'descriptive' | 'diagnostic' | 'predictive' | 'decision'

export type CpgQueryPlan = {
  intent: CpgIntent
  metrics: CpgMetric[]
  dimensions: CpgDimension[]
  comparison: 'previous_period' | 'year_over_year' | 'none'
  filters: Record<string, string>
}

const metricAliases: Record<CpgMetric, string[]> = {
  sales: ['sales', 'revenue', 'dollar sales', 'value'],
  units: ['units', 'volume', 'unit sales'],
  growth: ['growth', 'change', 'increase', 'decline'],
  market_share: ['share', 'market share'],
  velocity: ['velocity', 'rate of sale', 'ros'],
  price: ['price', 'average price'],
  distribution: ['distribution', 'acv', 'availability'],
  promotion_rate: ['promotion', 'promo', 'promoted'],
  incremental_sales: ['incremental', 'incremental sales'],
  promo_lift: ['promo lift', 'promotion lift', 'lift'],
  contribution: ['contribution', 'growth contribution'],
}

export function buildQueryPlan(question: string): CpgQueryPlan {
  const q = question.toLowerCase()
  const metrics = (Object.entries(metricAliases) as [CpgMetric, string[]][])
    .filter(([, aliases]) => aliases.some((alias) => q.includes(alias)))
    .map(([metric]) => metric)

  const intent: CpgIntent = /why|driver|reason|cause|declin|lost|drop/.test(q)
    ? 'diagnostic'
    : /forecast|predict|next|future|demand/.test(q)
      ? 'predictive'
      : /recommend|should|opportunity|action|what if|scenario/.test(q)
        ? 'decision'
        : 'descriptive'

  const dimensions: CpgDimension[] = []
  if (/market|total market/.test(q)) dimensions.push('market')
  if (/categor(y|ies)/.test(q)) dimensions.push('category')
  if (/brand/.test(q)) dimensions.push('brand')
  if (/sku|product/.test(q)) dimensions.push('product')
  if (/retailer|retail/.test(q)) dimensions.push('retailer')
  if (/channel/.test(q)) dimensions.push('channel')
  if (/region|geograph/.test(q)) dimensions.push('region')
  if (/store/.test(q)) dimensions.push('store')
  if (/week|month|quarter|year|period|trend/.test(q)) dimensions.push('time')

  const comparison = /year over year|yoy|last year|same period last year/.test(q)
    ? 'year_over_year'
    : /previous|prior|last period|month over month|mom|week over week|wow/.test(q)
      ? 'previous_period'
      : 'none'

  const filters: Record<string, string> = {}
  const retailer = q.match(/(?:at|from|for)\s+([a-z0-9][a-z0-9 &'’-]{1,40}?)(?=\s+(?:retailer|category|brand|region|channel)|[?.!,]|$)/i)?.[1]
  if (retailer && /retailer|at|from/.test(q)) filters.retailer = retailer.trim()

  return {
    intent,
    metrics: metrics.length ? [...new Set(metrics)] : ['sales', 'units', 'growth'],
    dimensions: dimensions.length ? [...new Set(dimensions)] : ['time'],
    comparison,
    filters,
  }
}
