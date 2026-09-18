-- Real-data CPG intelligence layer.
-- All metrics are computed in Postgres so the Next.js server does not load 1.5M+ facts into memory.
-- The function is SECURITY INVOKER: existing RLS remains authoritative.

CREATE OR REPLACE FUNCTION public.cpgist_dataset_analytics(p_dataset_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
  SELECT
    sf.id,
    COALESCE(sf.period, sf.week_ending)::date AS period,
    COALESCE(sf.sales, sf.dollar_sales)::numeric AS sales,
    sf.units::numeric AS units,
    COALESCE(sf.distribution, sf.acv_distribution)::numeric AS distribution,
    sf.on_promo,
    sf.promo_type,
    sf.discount_depth_pct,
    sf.product_id,
    sf.retailer_id,
    COALESCE(sf.brand_id, p.brand_id) AS brand_id,
    COALESCE(sf.category, p.category) AS category,
    p.subcategory,
    r.channel,
    r.region
  FROM public.sales_facts sf
  LEFT JOIN public.products p ON p.id = sf.product_id
  LEFT JOIN public.retailers r ON r.id = sf.retailer_id
  WHERE sf.dataset_id = p_dataset_id
),
metrics AS (
  SELECT
    count(*)::bigint AS row_count,
    COALESCE(sum(sales),0)::numeric AS sales,
    COALESCE(sum(units),0)::numeric AS units,
    CASE WHEN COALESCE(sum(units),0) > 0 THEN sum(sales) / sum(units) END AS average_price,
    CASE WHEN count(*) > 0 THEN 100.0 * count(*) FILTER (WHERE on_promo IS TRUE) / count(*) END AS promotion_rate,
    avg(distribution) FILTER (WHERE distribution IS NOT NULL) AS average_distribution,
    min(period) AS min_period,
    max(period) AS max_period
  FROM base
),
trend AS (
  SELECT period, sum(sales)::numeric AS sales, sum(units)::numeric AS units
  FROM base
  WHERE period IS NOT NULL
  GROUP BY period
  ORDER BY period
),
category_totals AS (
  SELECT category AS key, sum(sales)::numeric AS sales, sum(units)::numeric AS units, count(*)::bigint AS rows
  FROM base GROUP BY category
),
brand_totals AS (
  SELECT bkey AS key, max(name) AS name, sum(sales)::numeric AS sales, sum(units)::numeric AS units, count(*)::bigint AS rows
  FROM (
    SELECT COALESCE(b.id::text, base.brand_id::text, 'Uncategorized') AS bkey,
           b.name, base.sales, base.units
    FROM base LEFT JOIN public.brands b ON b.id = base.brand_id
  ) x
  GROUP BY bkey
),
retailer_totals AS (
  SELECT rkey AS key, max(name) AS name, sum(sales)::numeric AS sales, sum(units)::numeric AS units, count(*)::bigint AS rows
  FROM (
    SELECT COALESCE(r.id::text, base.retailer_id::text, 'Unassigned') AS rkey,
           r.name, base.sales, base.units
    FROM base LEFT JOIN public.retailers r ON r.id = base.retailer_id
  ) x
  GROUP BY rkey
),
previous_period AS (
  SELECT max(period) AS latest_period FROM base
),
brand_growth AS (
  SELECT brand_id,
         CASE WHEN prev_sales > 0 THEN 100.0 * (latest_sales - prev_sales) / prev_sales END AS latest_growth
  FROM (
    SELECT brand_id,
           sum(sales) FILTER (WHERE period = (SELECT latest_period FROM previous_period)) AS latest_sales,
           sum(sales) FILTER (WHERE period = (SELECT latest_period FROM previous_period) - interval '7 days') AS prev_sales
    FROM base
    GROUP BY brand_id
  ) q
),
promo_baseline AS (
  SELECT product_id, retailer_id,
         avg(sales) FILTER (WHERE on_promo IS FALSE) AS baseline_sales,
         avg(units) FILTER (WHERE on_promo IS FALSE) AS baseline_units
  FROM base
  GROUP BY product_id, retailer_id
),
promo AS (
  SELECT
    sum(b.sales - COALESCE(pb.baseline_sales,0)) FILTER (WHERE b.on_promo IS TRUE AND pb.baseline_sales IS NOT NULL) AS incremental_sales,
    sum(COALESCE(pb.baseline_sales,0)) FILTER (WHERE b.on_promo IS TRUE AND pb.baseline_sales IS NOT NULL) AS expected_promo_sales,
    count(*) FILTER (WHERE b.on_promo IS TRUE) AS promo_rows
  FROM base b
  LEFT JOIN promo_baseline pb ON pb.product_id = b.product_id AND pb.retailer_id = b.retailer_id
),
price_elasticity AS (
  SELECT
    regr_slope(ln(units), ln(NULLIF(sales / NULLIF(units,0),0))) AS elasticity,
    regr_r2(ln(units), ln(NULLIF(sales / NULLIF(units,0),0))) AS r2,
    count(*) FILTER (WHERE units > 0 AND sales > 0) AS observations
  FROM base
),
competitive AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cs.id, 'brandId', cs.brand_id, 'category', cs.category,
    'retailerId', cs.retailer_id, 'region', cs.region, 'date', cs.signal_date,
    'type', cs.signal_type, 'magnitudePct', cs.magnitude_pct, 'description', cs.description
  ) ORDER BY cs.signal_date DESC), '[]'::jsonb) AS data
  FROM public.competitor_signals cs
  WHERE cs.brand_id IN (SELECT DISTINCT brand_id FROM base WHERE brand_id IS NOT NULL)
),
relationships AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', br.id, 'brandId', br.brand_id, 'relatedBrandId', br.related_brand_id,
    'relationshipType', br.relationship_type, 'category', br.category,
    'overlappingRegions', br.overlapping_regions
  ) ORDER BY br.id), '[]'::jsonb) AS data
  FROM public.brand_relationships br
  WHERE br.brand_id IN (SELECT DISTINCT brand_id FROM base WHERE brand_id IS NOT NULL)
),
category_whitespace AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', category, 'averageDistribution', average_distribution,
    'distributionGap', CASE WHEN average_distribution IS NULL THEN NULL ELSE 100 - average_distribution END,
    'sales', sales
  ) ORDER BY sales DESC), '[]'::jsonb) AS data
  FROM (
    SELECT category, avg(distribution) AS average_distribution, sum(sales) AS sales
    FROM base GROUP BY category
  ) q
),
anomalies AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('period', period, 'sales', sales, 'zScore', z_score) ORDER BY abs(z_score) DESC), '[]'::jsonb) AS data
  FROM (
    SELECT period, sales,
           CASE WHEN stats.sd > 0 THEN (sales - stats.mean) / stats.sd END AS z_score
    FROM base
    CROSS JOIN (SELECT avg(sales) AS mean, stddev_pop(sales) AS sd FROM base) stats
    WHERE period IS NOT NULL
  ) q
  WHERE abs(z_score) > 2
  LIMIT 20
)
SELECT jsonb_build_object(
  'metrics', jsonb_build_object(
    'rowCount', metrics.row_count, 'sales', metrics.sales, 'units', metrics.units,
    'averagePrice', metrics.average_price, 'promotionRate', metrics.promotion_rate,
    'averageDistribution', metrics.average_distribution,
    'minPeriod', metrics.min_period, 'maxPeriod', metrics.max_period
  ),
  'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('period',period,'sales',sales,'units',units) ORDER BY period) FROM trend),'[]'::jsonb),
  'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',key,'name',key,'sales',sales,'units',units,'rows',rows,'marketShare',CASE WHEN metrics.sales>0 THEN 100*sales/metrics.sales END) ORDER BY sales DESC) FROM category_totals),'[]'::jsonb),
  'brands', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',key,'name',name,'sales',sales,'units',units,'rows',rows,'marketShare',CASE WHEN metrics.sales>0 THEN 100*sales/metrics.sales END,'latestGrowth',bg.latest_growth) ORDER BY sales DESC) FROM brand_totals bt LEFT JOIN brand_growth bg ON bg.brand_id::text = bt.key),'[]'::jsonb),
  'retailers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',key,'name',name,'sales',sales,'units',units,'rows',rows,'marketShare',CASE WHEN metrics.sales>0 THEN 100*sales/metrics.sales END) ORDER BY sales DESC) FROM retailer_totals),'[]'::jsonb),
  'promo', jsonb_build_object('promoRows',promo.promo_rows,'incrementalSales',promo.incremental_sales,'expectedPromoSales',promo.expected_promo_sales,'promoLift',CASE WHEN promo.expected_promo_sales>0 THEN 100*promo.incremental_sales/promo.expected_promo_sales END),
  'elasticity', jsonb_build_object('elasticity',price_elasticity.elasticity,'r2',price_elasticity.r2,'observations',price_elasticity.observations,'definition','Observed log(units) vs log(price), where price = sales / units; not a causal estimate.'),
  'competitiveSignals', (SELECT data FROM competitive),
  'brandRelationships', (SELECT data FROM relationships),
  'distributionWhitespace', (SELECT data FROM category_whitespace),
  'anomalies', (SELECT data FROM anomalies),
  'lineage', jsonb_build_object('datasetId',p_dataset_id,'source','user-supplied Syndicate data.zip','factsTable','sales_facts','calculation','PostgreSQL deterministic aggregation','generatedAt',now())
)
FROM metrics, promo, price_elasticity;
$$;

REVOKE ALL ON FUNCTION public.cpgist_dataset_analytics(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpgist_dataset_analytics(bigint) TO authenticated;

CREATE INDEX IF NOT EXISTS sales_facts_dataset_product_retailer_period_idx
ON public.sales_facts(dataset_id, product_id, retailer_id, period);
CREATE INDEX IF NOT EXISTS sales_facts_dataset_promo_idx
ON public.sales_facts(dataset_id, on_promo, period);
CREATE INDEX IF NOT EXISTS sales_facts_dataset_retailer_period_idx
ON public.sales_facts(dataset_id, retailer_id, period);
CREATE INDEX IF NOT EXISTS sales_facts_dataset_category_period_idx
ON public.sales_facts(dataset_id, category, period);
CREATE INDEX IF NOT EXISTS competitor_signals_brand_date_idx
ON public.competitor_signals(brand_id, signal_date DESC);
