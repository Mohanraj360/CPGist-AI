-- Follow-up constraints for the additive legacy-schema compatibility layer.
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS datasets_created_by_updated_idx
ON public.datasets(created_by, updated_at DESC);

-- Populate stable row hashes before adding the unique constraint used by ingestion upserts.
UPDATE public.sales_facts
SET row_hash = md5(concat_ws('|', COALESCE(period::text, week_ending::text, ''), COALESCE(product_id::text, ''), COALESCE(retailer_id::text, ''), COALESCE(dollar_sales::text, sales::text, ''), COALESCE(units::text, '')))
WHERE row_hash IS NULL;

-- Older data can contain duplicate rows. Keep the first row for each generated key and
-- leave later duplicates with a null hash so the uniqueness constraint remains safe.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY dataset_id, row_hash ORDER BY id) AS rn
  FROM public.sales_facts
  WHERE row_hash IS NOT NULL
)
UPDATE public.sales_facts sf
SET row_hash = NULL
FROM ranked r
WHERE sf.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sales_facts_dataset_row_hash_uidx
ON public.sales_facts(dataset_id, row_hash)
WHERE row_hash IS NOT NULL;
