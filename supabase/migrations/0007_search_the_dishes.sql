-- Make the dishes searchable.
--
-- Deep Dish records what a restaurant is known for — 77 dish names across the
-- corpus, in live_rows.dishes. None of it was searchable. search_restaurants
-- read only restaurants.search_text, which is name, place, cuisine tags and
-- the summary prose, so "gumbo" returned nothing while the database held
-- Dooky Chase's gumbo the whole time.
--
-- That is the wrong failure for a product whose job includes "what should we
-- order". A search that knows the answer and says nothing is worse than one
-- that never knew.
--
-- Dishes are matched separately rather than concatenated into search_text so
-- the caller can say *why* something matched. "Known for gumbo" is a better
-- answer than an unexplained row, and the provenance stays visible: a dish
-- name comes from review patterns, not from the restaurant's own pages.

-- Adding a column to the result type means the old signature has to go first.
drop function if exists public.search_restaurants(text, integer);

create function public.search_restaurants(q text, limit_n integer default 20)
returns table (
  slug text,
  title text,
  region text,
  region_group text,
  cuisine_tags text[],
  lat double precision,
  lng double precision,
  score real,
  matched_dish text
)
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $$
  with dish_text as (
    select l.slug,
           string_agg(lower(d->>'name'), ' ') as names,
           -- The best single dish match, for the caller to show as the reason.
           (array_agg(d->>'name' order by word_similarity(q, lower(d->>'name')) desc))[1] as best,
           max(word_similarity(q, lower(d->>'name'))) as dish_score
    from public.live_rows l, jsonb_array_elements(l.dishes) d
    where l.dishes is not null and jsonb_typeof(l.dishes) = 'array'
    group by l.slug
  )
  select r.slug, r.title, r.region, r.region_group, r.cuisine_tags,
         lr.lat, lr.lng,
         greatest(
           word_similarity(q, r.search_text),
           coalesce(dt.dish_score, 0)
         )::real as score,
         -- Only name a dish when the dish is actually why this row is here.
         case
           when coalesce(dt.dish_score, 0) > word_similarity(q, r.search_text)
             then dt.best
           else null
         end as matched_dish
  from public.restaurants r
  left join public.live_rows lr on lr.slug = r.slug
  left join dish_text dt on dt.slug = r.slug
  where q <% r.search_text
     or (dt.names is not null and q <% dt.names)
  order by score desc, r.title
  limit least(coalesce(limit_n, 20), 50);
$$;

grant execute on function public.search_restaurants(text, integer) to anon, authenticated;

comment on function public.search_restaurants(text, integer) is
  'Cross-region search over name, place, cuisine, summary prose and known-for dishes. matched_dish is set only when a dish is the reason the row matched.';
