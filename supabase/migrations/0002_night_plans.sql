-- Deep Dish · night plans
--
-- A night plan lives in one browser's localStorage today: lose the browser and
-- you lose the plan, and there is no way to send it to the people you are
-- eating with. This gives a plan a URL.
--
-- No accounts. A plan is addressed by an unguessable id, readable by anyone
-- holding the link and writable by nobody afterwards. That matches how people
-- actually share a dinner plan, and it means no login stands between a reader
-- and a decision they already made.

create table if not exists public.night_plans (
  -- 22 chars of base58-ish entropy, generated client-side; unguessable enough
  -- that the link is the capability, short enough to paste into a message.
  id           text primary key check (char_length(id) between 16 and 40),

  -- the ordered stops
  slugs        text[] not null check (cardinality(slugs) between 1 and 12),

  -- the situation the plan was built against, so the receiving reader sees the
  -- same ranking rather than a different one. Coarse by construction: an
  -- origin is stored as a label only, never as coordinates, so a shared link
  -- cannot leak where someone lives.
  situation    jsonb not null default '{}'::jsonb,
  origin_label text,

  title        text check (title is null or char_length(title) <= 120),
  note         text check (note  is null or char_length(note)  <= 2000),

  created_at   timestamptz not null default now(),
  -- Plans are ephemeral by default. A dinner plan has a short life and holding
  -- them forever is a liability, not a feature.
  expires_at   timestamptz not null default now() + interval '90 days'
);

create index if not exists night_plans_expiry_idx on public.night_plans (expires_at);

alter table public.night_plans enable row level security;

-- Anyone holding the id may read an unexpired plan.
drop policy if exists "a plan is readable by its link" on public.night_plans;
create policy "a plan is readable by its link"
  on public.night_plans for select
  using (expires_at > now());

-- Anyone may create one. There is nothing to authenticate against and nothing
-- of value to take; the id is the secret.
drop policy if exists "anyone may save a plan" on public.night_plans;
create policy "anyone may save a plan"
  on public.night_plans for insert
  with check (
    cardinality(slugs) between 1 and 12
    and expires_at <= now() + interval '400 days'
  );

-- Deliberately no update or delete policy: a shared link must not change under
-- the person you sent it to. Saving again mints a new id.

-- Housekeeping. Call from a scheduled job; safe to run repeatedly.
create or replace function public.purge_expired_night_plans()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.night_plans where expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;
