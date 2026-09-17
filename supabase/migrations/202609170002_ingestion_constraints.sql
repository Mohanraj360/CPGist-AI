-- Follow-up constraints for the additive legacy-schema compatibility layer.
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_facts_dataset_row_hash_uidx
ON public.sales_facts(dataset_id, row_hash)
WHERE row_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS datasets_created_by_updated_idx
ON public.datasets(created_by, updated_at DESC);

-- Keep legacy facts usable when row_hash was not populated by older loads.
UPDATE public.sales_facts
SET row_hash = md5(concat_ws('|', COALESCE(period::text, week_ending::text, ''), COALESCE(product_id::text, ''), COALESCE(retailer_id::text, ''), COALESCE(dollar_sales::text, sales::text, ''), COALESCE(units::text, '')))
WHERE row_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_facts_dataset_row_hash_uidx_after_backfill
ON public.sales_facts(dataset_id, row_hash)
WHERE row_hash IS NOT NULL;
