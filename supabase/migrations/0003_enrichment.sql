-- Deep Dish · enrichment runs
--
-- pipeline:enrich writes to enrichment.json — a single large file that churns
-- in git on every run, cannot be queried, and keeps no history. Which of the
-- 983 unenriched records were attempted, what failed and why, is not
-- recoverable from it.

create table if not exists public.enrichment_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  mode         text not null check (mode in ('enrich', 'hygiene', 'discover', 'refresh')),
  batch_size   integer,
  attempted    integer not null default 0,
  succeeded    integer not null default 0,
  failed       integer not null default 0,
  notes        text
);

create table if not exists public.enrichment_results (
  id          bigint generated always as identity primary key,
  run_id      bigint not null references public.enrichment_runs (id) on delete cascade,
  slug        text   not null,
  status      text   not null check (status in ('ok', 'partial', 'unreachable', 'source-limited', 'skipped', 'error')),
  -- what the fetch actually produced, kept whole for audit
  payload     jsonb,
  -- why it failed, in the pipeline's own words
  reason      text,
  fetched_at  timestamptz not null default now()
);

create index if not exists enrichment_results_run_idx    on public.enrichment_results (run_id);
create index if not exists enrichment_results_slug_idx   on public.enrichment_results (slug, fetched_at desc);
create index if not exists enrichment_results_status_idx on public.enrichment_results (status);

alter table public.enrichment_runs    enable row level security;
alter table public.enrichment_results enable row level security;

-- Operational history is not public. No anon policy is defined, so the anon key
-- sees nothing; the pipeline writes with the service role, which bypasses RLS.

-- What is still worth attempting, and what keeps failing.
create or replace view public.enrichment_coverage as
select
  r.slug,
  r.title,
  r.region_group,
  (l.slug is not null)                                   as has_live_row,
  (l.hours is not null)                                  as has_hours,
  (l.pp_low is not null)                                 as has_price,
  last_result.status                                     as last_status,
  last_result.reason                                     as last_reason,
  last_result.fetched_at                                 as last_attempt
from public.restaurants r
left join public.live_rows l on l.slug = r.slug
left join lateral (
  select status, reason, fetched_at
  from public.enrichment_results er
  where er.slug = r.slug
  order by er.fetched_at desc
  limit 1
) as last_result on true;
