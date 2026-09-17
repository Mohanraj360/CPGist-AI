-- Additive compatibility layer for the existing integer/bigint CPGist schema.
-- Preserves existing primary keys and data while adding the columns used by the current app.

ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS dataset_id bigint;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS brand_id integer;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS period date;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS sales numeric;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS distribution numeric;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE public.sales_facts ADD COLUMN IF NOT EXISTS row_hash text;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS dataset_id bigint;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dataset_id bigint;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS dataset_id bigint;

UPDATE public.datasets SET source = source_type WHERE source IS NULL;
UPDATE public.sales_facts SET period = week_ending WHERE period IS NULL;
UPDATE public.sales_facts SET sales = dollar_sales WHERE sales IS NULL;
UPDATE public.sales_facts SET distribution = acv_distribution WHERE distribution IS NULL;

CREATE INDEX IF NOT EXISTS sales_facts_dataset_period_idx ON public.sales_facts(dataset_id, period);
CREATE INDEX IF NOT EXISTS sales_facts_dataset_brand_idx ON public.sales_facts(dataset_id, brand_id);
CREATE INDEX IF NOT EXISTS brands_dataset_name_idx ON public.brands(dataset_id, name);
CREATE INDEX IF NOT EXISTS products_dataset_name_idx ON public.products(dataset_id, name);
CREATE INDEX IF NOT EXISTS retailers_dataset_name_idx ON public.retailers(dataset_id, name);

CREATE TABLE IF NOT EXISTS public.dataset_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id bigint NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  byte_size bigint NOT NULL DEFAULT 0,
  checksum text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dataset_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id bigint NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  name text NOT NULL,
  data_type text NOT NULL,
  ordinal integer NOT NULL,
  nullable boolean NOT NULL DEFAULT true,
  null_count bigint NOT NULL DEFAULT 0,
  distinct_count bigint NOT NULL DEFAULT 0,
  min_value text,
  max_value text,
  UNIQUE(dataset_id, name)
);

CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id bigint NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  rows_seen bigint NOT NULL DEFAULT 0,
  rows_inserted bigint NOT NULL DEFAULT 0,
  rows_rejected bigint NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id bigint NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  severity text NOT NULL,
  code text NOT NULL,
  message text NOT NULL,
  row_number bigint,
  column_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id bigint REFERENCES public.datasets(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS dataset_id bigint REFERENCES public.datasets(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS data_connections_provider_creator_idx ON public.data_connections(provider, created_by);
CREATE INDEX IF NOT EXISTS analyses_dataset_created_idx ON public.analyses(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS validation_results_dataset_created_idx ON public.validation_results(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_runs_workflow_created_idx ON public.workflow_runs(workflow_id, created_at DESC);

-- If the existing environment contains exactly one dataset, attach legacy facts and dimensions to it.
DO $$
DECLARE
  only_dataset bigint;
  dataset_count integer;
BEGIN
  SELECT count(*), min(id) INTO dataset_count, only_dataset FROM public.datasets;
  IF dataset_count = 1 THEN
    UPDATE public.sales_facts SET dataset_id = only_dataset WHERE dataset_id IS NULL;
    UPDATE public.brands SET dataset_id = only_dataset WHERE dataset_id IS NULL;
    UPDATE public.products SET dataset_id = only_dataset WHERE dataset_id IS NULL;
    UPDATE public.retailers SET dataset_id = only_dataset WHERE dataset_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.dataset_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpgist_dataset_files_org ON public.dataset_files;
CREATE POLICY cpgist_dataset_files_org ON public.dataset_files FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_files.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_files.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));

DROP POLICY IF EXISTS cpgist_dataset_columns_org ON public.dataset_columns;
CREATE POLICY cpgist_dataset_columns_org ON public.dataset_columns FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_columns.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_columns.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));

DROP POLICY IF EXISTS cpgist_ingestion_jobs_org ON public.ingestion_jobs;
CREATE POLICY cpgist_ingestion_jobs_org ON public.ingestion_jobs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = ingestion_jobs.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = ingestion_jobs.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));

DROP POLICY IF EXISTS cpgist_validation_results_org ON public.validation_results;
CREATE POLICY cpgist_validation_results_org ON public.validation_results FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = validation_results.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = validation_results.dataset_id AND d.org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())));

DROP POLICY IF EXISTS cpgist_analyses_owner ON public.analyses;
CREATE POLICY cpgist_analyses_owner ON public.analyses FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS cpgist_workflows_owner ON public.workflows;
CREATE POLICY cpgist_workflows_owner ON public.workflows FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS cpgist_workflow_runs_owner ON public.workflow_runs;
CREATE POLICY cpgist_workflow_runs_owner ON public.workflow_runs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_runs.workflow_id AND w.created_by = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_runs.workflow_id AND w.created_by = auth.uid()));

DROP POLICY IF EXISTS cpgist_data_connections_owner ON public.data_connections;
CREATE POLICY cpgist_data_connections_owner ON public.data_connections FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
