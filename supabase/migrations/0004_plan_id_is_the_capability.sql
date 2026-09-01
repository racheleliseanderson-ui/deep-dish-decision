-- The plan id is the capability — make the database enforce that.
--
-- 0002 gave night_plans a SELECT policy of `expires_at > now()`. Row-level
-- security filters rows, it does not see the request's filters, so that policy
-- said: any holder of the publishable key may read every unexpired plan.
-- `GET /rest/v1/night_plans?select=*` returned the lot — every title, note and
-- origin label anyone had ever saved. The 22-character unguessable id was
-- decoration on a table you did not need to guess your way into.
--
-- The fix is to stop exposing the table to readers at all and hand out exactly
-- one row through a function that requires the id up front.

drop policy if exists "a plan is readable by its link" on public.night_plans;

-- No SELECT policy on night_plans now. anon/authenticated read plans only
-- through this function, which cannot be coaxed into returning a second row.
create or replace function public.get_night_plan(plan_id text)
returns table (
  id text,
  slugs text[],
  situation jsonb,
  origin_label text,
  title text,
  note text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.slugs, p.situation, p.origin_label, p.title, p.note, p.created_at
  from public.night_plans p
  where p.id = plan_id
    -- Reject anything that is not a full-length id before it reaches the
    -- index, so this can never be walked with prefixes or a LIKE.
    and char_length(plan_id) between 16 and 40
    and p.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_night_plan(text) from public;
grant execute on function public.get_night_plan(text) to anon, authenticated;

comment on function public.get_night_plan(text) is
  'Fetch one night plan by its full id. The id is the capability: night_plans has no SELECT policy, so this is the only read path.';
