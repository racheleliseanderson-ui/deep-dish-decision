-- Say how much of the corpus Postgres actually holds.
--
-- Seeding is incremental, and a half-seeded database is more dangerous than an
-- empty one: cross-region search returns *something*, so an absent restaurant
-- reads as "not in Deep Dish" rather than "not loaded yet". The JSON is the
-- source of truth and has all 1,094; the database has however many have been
-- pushed to it. The UI can only be honest about that if it can ask.

create or replace view public.corpus_coverage
with (security_invoker = true) as
  select count(*)::int as seeded,
         count(distinct region)::int as regions,
         count(*) filter (where search_text is not null and length(search_text) > 160)::int as with_prose,
         max(updated_at) as last_seeded_at
  from public.restaurants;

grant select on public.corpus_coverage to anon, authenticated;

comment on view public.corpus_coverage is
  'How much of the corpus Postgres actually holds. The app reads this so it can say what cross-region search covers instead of implying it covers everything.';
