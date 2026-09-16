-- CPGist hardening: protect cross-brand signal tables and prevent duplicate dimensions.
alter table public.brand_relationships enable row level security;
alter table public.signal_notes enable row level security;
alter table public.competitor_signals enable row level security;

create policy brand_relationships_owner on public.brand_relationships for all to authenticated
using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy signal_notes_owner on public.signal_notes for all to authenticated
using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));
create policy competitor_signals_owner on public.competitor_signals for all to authenticated
using (public.dataset_owner(dataset_id)) with check (public.dataset_owner(dataset_id));

-- Dimension writes are de-duplicated by the ingestion service before insert.
create index if not exists sales_facts_dataset_category_idx
on public.sales_facts(dataset_id, category);
create index if not exists analyses_dataset_created_idx
on public.analyses(dataset_id, created_at desc);
create index if not exists workflow_runs_workflow_created_idx
on public.workflow_runs(workflow_id, started_at desc);
