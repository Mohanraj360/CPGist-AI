create extension if not exists pgcrypto;

create table if not exists public.datasets (id uuid primary key default gen_random_uuid(), name text not null, source text not null, status text not null default 'pending' check (status in ('pending','profiling','validating','ready','failed')), row_count bigint not null default 0, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.dataset_files (id uuid primary key default gen_random_uuid(), dataset_id uuid not null references public.datasets(id) on delete cascade, file_name text not null, storage_path text, byte_size bigint, checksum text, created_at timestamptz not null default now());
create table if not exists public.dataset_columns (id uuid primary key default gen_random_uuid(), dataset_id uuid not null references public.datasets(id) on delete cascade, name text not null, data_type text not null, ordinal integer not null, nullable boolean not null default true, null_count bigint not null default 0, distinct_count bigint not null default 0, min_value text, max_value text, unique(dataset_id,name));
create table if not exists public.ingestion_jobs (id uuid primary key default gen_random_uuid(), dataset_id uuid not null references public.datasets(id) on delete cascade, status text not null default 'queued' check (status in ('queued','running','completed','failed')), rows_seen bigint not null default 0, rows_inserted bigint not null default 0, rows_rejected bigint not null default 0, error_message text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.validation_results (id uuid primary key default gen_random_uuid(), dataset_id uuid not null references public.datasets(id) on delete cascade, severity text not null check (severity in ('info','warning','error')), code text not null, message text not null, row_number bigint, column_name text, created_at timestamptz not null default now());
create table if not exists public.products (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete cascade, name text not null, brand_id uuid, category text, sku text);
create table if not exists public.brands (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete cascade, name text not null);
create table if not exists public.retailers (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete cascade, name text not null);
create table if not exists public.sales_facts (id bigserial primary key, dataset_id uuid not null references public.datasets(id) on delete cascade, period date, product_id uuid, brand_id uuid, retailer_id uuid, category text, sales numeric, units numeric, distribution numeric, price numeric, on_promo boolean, row_hash text not null, unique(dataset_id,row_hash));
create table if not exists public.brand_relationships (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete cascade, parent_brand_id uuid, child_brand_id uuid, relationship text);
create table if not exists public.signal_notes (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete cascade, title text not null, body text not null, source_metric text, created_at timestamptz not null default now());
create table if not exists public.competitor_signals (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete cascade, subject text not null, competitor text not null, metric text not null, value numeric, period date);
create table if not exists public.analyses (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete set null, prompt text not null, result jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now());
create table if not exists public.reports (id uuid primary key default gen_random_uuid(), dataset_id uuid references public.datasets(id) on delete set null, name text not null, status text not null default 'draft', created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.report_sections (id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade, title text not null, body text not null, ordinal integer not null default 0);
create table if not exists public.workflows (id uuid primary key default gen_random_uuid(), name text not null, definition jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.workflow_runs (id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.workflows(id) on delete cascade, status text not null default 'queued', detail jsonb not null default '{}'::jsonb, started_at timestamptz, completed_at timestamptz);
create table if not exists public.data_connections (id uuid primary key default gen_random_uuid(), provider text not null, status text not null default 'not_configured', metadata jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete cascade, created_at timestamptz not null default now());

create index if not exists sales_facts_dataset_period_idx on public.sales_facts(dataset_id,period);
create index if not exists sales_facts_brand_idx on public.sales_facts(dataset_id,brand_id);
create index if not exists sales_facts_retailer_idx on public.sales_facts(dataset_id,retailer_id);
create index if not exists validation_results_dataset_idx on public.validation_results(dataset_id,severity);

alter table public.datasets enable row level security;
alter table public.dataset_files enable row level security;
alter table public.dataset_columns enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.validation_results enable row level security;
alter table public.products enable row level security;
alter table public.brands enable row level security;
alter table public.retailers enable row level security;
alter table public.sales_facts enable row level security;
alter table public.analyses enable row level security;
alter table public.reports enable row level security;
alter table public.report_sections enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.data_connections enable row level security;

create policy datasets_owner on public.datasets for all to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy datasets_public_read on public.datasets for select to anon using (created_by is null);

create or replace function public.dataset_owner(dataset uuid) returns boolean language sql stable security invoker set search_path = '' as $$ select exists (select 1 from public.datasets where id = dataset and (created_by = (select auth.uid()) or created_by is null)); $$;

create policy dataset_files_owner on public.dataset_files for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy dataset_columns_owner on public.dataset_columns for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy ingestion_jobs_owner on public.ingestion_jobs for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy validation_results_owner on public.validation_results for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy products_owner on public.products for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy brands_owner on public.brands for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy retailers_owner on public.retailers for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy sales_facts_owner on public.sales_facts for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy analyses_owner on public.analyses for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy reports_owner on public.reports for all to authenticated using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy report_sections_owner on public.report_sections for all to authenticated using (exists (select 1 from public.reports where id = report_id and public.dataset_owner(dataset_id)));
create policy workflows_owner on public.workflows for all to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy workflow_runs_owner on public.workflow_runs for all to authenticated using (exists (select 1 from public.workflows where id = workflow_id and created_by = (select auth.uid()))) with check (exists (select 1 from public.workflows where id = workflow_id and created_by = (select auth.uid())));
create policy data_connections_owner on public.data_connections for all to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
