-- Create a small, deterministic demo dataset only when the workspace has no datasets.
-- This is synthetic demo data, never a replacement for user-provided data.
DO $$
DECLARE
  ds bigint;
  apex integer;
  fresh integer;
  urban integer;
  qc integer;
  dm integer;
  apex_prod integer;
  fresh_prod integer;
  urban_prod integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.datasets LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.datasets (key, name, table_name, source_type, source, status, row_count, org_id)
  VALUES ('cpgist_demo', 'CPGist Demo Retail Sales', 'sales_facts', 'synthetic_demo', 'Built-in synthetic demo', 'ready', 24, 1)
  RETURNING id INTO ds;

  INSERT INTO public.brands (name, category, parent_company, org_id)
  VALUES ('Apex Foods', 'Snacks', 'Apex Consumer', 1),
         ('FreshField', 'Snacks', 'FreshField Group', 1),
         ('Urban Harvest', 'Snacks', 'Urban Harvest Co', 1)
  RETURNING id INTO apex;

  SELECT id INTO fresh FROM public.brands WHERE name = 'FreshField' AND org_id = 1 ORDER BY id DESC LIMIT 1;
  SELECT id INTO urban FROM public.brands WHERE name = 'Urban Harvest' AND org_id = 1 ORDER BY id DESC LIMIT 1;

  INSERT INTO public.retailers (name, channel, region, total_stores, org_id)
  VALUES ('QuickCart', 'Quick Commerce', 'India', 850, 1),
         ('DailyMart', 'Modern Trade', 'India', 420, 1)
  RETURNING id INTO qc;
  SELECT id INTO dm FROM public.retailers WHERE name = 'DailyMart' AND org_id = 1 ORDER BY id DESC LIMIT 1;

  INSERT INTO public.products (brand_id, name, category, subcategory, org_id)
  VALUES (apex, 'Apex Crunch Mix', 'Snacks', 'Savory Snacks', 1)
  RETURNING id INTO apex_prod;
  INSERT INTO public.products (brand_id, name, category, subcategory, org_id)
  VALUES (fresh, 'FreshField Oat Bites', 'Snacks', 'Healthy Snacks', 1)
  RETURNING id INTO fresh_prod;
  INSERT INTO public.products (brand_id, name, category, subcategory, org_id)
  VALUES (urban, 'Urban Harvest Trail Mix', 'Snacks', 'Trail Mix', 1)
  RETURNING id INTO urban_prod;

  INSERT INTO public.sales_facts (dataset_id, product_id, retailer_id, week_ending, dollar_sales, units, acv_distribution, on_promo, discount_depth_pct, org_id)
  VALUES
    (ds, apex_prod, qc, '2026-07-05', 18400, 920, 72, false, 0, 1),
    (ds, fresh_prod, qc, '2026-07-05', 15100, 755, 68, false, 0, 1),
    (ds, urban_prod, qc, '2026-07-05', 12600, 630, 61, false, 0, 1),
    (ds, apex_prod, dm, '2026-07-05', 22100, 1105, 81, false, 0, 1),
    (ds, fresh_prod, dm, '2026-07-05', 19300, 965, 77, false, 0, 1),
    (ds, urban_prod, dm, '2026-07-05', 14300, 715, 69, false, 0, 1),
    (ds, apex_prod, qc, '2026-07-12', 19600, 980, 73, false, 0, 1),
    (ds, fresh_prod, qc, '2026-07-12', 15800, 790, 69, false, 0, 1),
    (ds, urban_prod, qc, '2026-07-12', 13100, 655, 62, true, 10, 1),
    (ds, apex_prod, dm, '2026-07-12', 22800, 1140, 82, false, 0, 1),
    (ds, fresh_prod, dm, '2026-07-12', 20100, 1005, 78, false, 0, 1),
    (ds, urban_prod, dm, '2026-07-12', 14900, 745, 70, true, 10, 1),
    (ds, apex_prod, qc, '2026-07-19', 20500, 1025, 74, false, 0, 1),
    (ds, fresh_prod, qc, '2026-07-19', 16100, 805, 70, false, 0, 1),
    (ds, urban_prod, qc, '2026-07-19', 13600, 680, 63, false, 0, 1),
    (ds, apex_prod, dm, '2026-07-19', 23500, 1175, 83, false, 0, 1),
    (ds, fresh_prod, dm, '2026-07-19', 20700, 1035, 79, false, 0, 1),
    (ds, urban_prod, dm, '2026-07-19', 15200, 760, 71, false, 0, 1),
    (ds, apex_prod, qc, '2026-07-26', 21200, 1060, 75, false, 0, 1),
    (ds, fresh_prod, qc, '2026-07-26', 16600, 830, 71, false, 0, 1),
    (ds, urban_prod, qc, '2026-07-26', 14100, 705, 64, false, 0, 1),
    (ds, apex_prod, dm, '2026-07-26', 24100, 1205, 84, false, 0, 1),
    (ds, fresh_prod, dm, '2026-07-26', 21300, 1065, 80, false, 0, 1),
    (ds, urban_prod, dm, '2026-07-26', 15800, 790, 72, false, 0, 1);

  UPDATE public.datasets SET row_count = 24, status = 'ready', updated_at = now() WHERE id = ds;
END $$;

-- Populate the compatibility aliases and hashes for the newly seeded facts.
UPDATE public.sales_facts SET period = week_ending WHERE dataset_id IS NOT NULL AND period IS NULL;
UPDATE public.sales_facts SET sales = dollar_sales WHERE dataset_id IS NOT NULL AND sales IS NULL;
UPDATE public.sales_facts SET distribution = acv_distribution WHERE dataset_id IS NOT NULL AND distribution IS NULL;
UPDATE public.sales_facts
SET row_hash = md5(concat_ws('|', dataset_id::text, period::text, product_id::text, retailer_id::text, sales::text, units::text))
WHERE dataset_id IS NOT NULL AND row_hash IS NULL;
