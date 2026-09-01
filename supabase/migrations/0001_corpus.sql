-- Deep Dish · corpus
--
-- The 1094 records and the dynamic layer, as tables.
--
-- Design note: this is the source of truth for the pipeline and for
-- cross-region search. It does NOT replace the per-region JSON the app ships.
-- The ranked list must stay instant and must work when the database is
-- unreachable, so the JSON remains a build artefact generated from these
-- tables. The database earns its place on the things JSON cannot do: search
-- across all 167 regions without shipping them, accumulating pipeline runs,
-- and storing what people save.

create extension if not exists pg_trgm;
-- Geographic distance without PostGIS. `earthdistance` needs `cube`.
create extension if not exists cube;
create extension if not exists earthdistance;

-- ── restaurants ───────────────────────────────────────────────────────────
create table if not exists public.restaurants (
  slug             text primary key,
  record_id        text,
  title            text not null,
  region           text not null,
  region_group     text not null,
  city             text,
  state_province   text,
  address          text,
  phone            text,
  website          text,
  reservation_url  text,
  menu_url         text,

  -- the twelve-field evidence floor, kept whole rather than shredded
  evidence         jsonb not null default '{}'::jsonb,
  signals          jsonb not null default '{}'::jsonb,
  taxonomies       jsonb not null default '{}'::jsonb,

  cuisine_tags     text[] not null default '{}',
  booking_paths    text[] not null default '{}',
  spend_bands      text[] not null default '{}',
  daypart_tags     text[] not null default '{}',

  depth_filled     smallint not null default 0,
  depth_total      smallint not null default 12,
  unknowns_count   smallint not null default 0,
  thin_field_count smallint not null default 0,
  has_conflict     boolean  not null default false,
  review_status    text,
  reviewed_at      date,
  next_review_at   date,

  -- one column the app can search without loading the corpus
  search_text      text,
  updated_at       timestamptz not null default now()
);

create index if not exists restaurants_region_group_idx on public.restaurants (region_group);
create index if not exists restaurants_region_idx       on public.restaurants (region);
create index if not exists restaurants_city_idx         on public.restaurants (city, state_province);
create index if not exists restaurants_cuisine_idx      on public.restaurants using gin (cuisine_tags);
create index if not exists restaurants_search_idx       on public.restaurants using gin (search_text gin_trgm_ops);

-- ── the dynamic layer ─────────────────────────────────────────────────────
-- Split out because it is regenerated wholesale by build-live-index and has a
-- different provenance story from the first-party record.
create table if not exists public.live_rows (
  slug          text primary key references public.restaurants (slug) on delete cascade,

  lat           double precision,
  lng           double precision,
  ll_source     text check (ll_source in ('exact', 'city')),
  tz            text,
  neighbourhood text,

  -- seven days, Sunday first, each an array of [openMinute, closeMinute]
  hours         jsonb,
  hours_source  text check (hours_source in ('google', 'first-party-prose')),

  band          text check (band in ('$', '$$', '$$$', '$$$$')),
  band_source   text check (band_source in ('directory', 'planning-band')),
  pp_low        integer,
  pp_high       integer,
  pp_source     text check (pp_source in ('published', 'band', 'planning-band')),
  pp_service    smallint,

  rating        numeric(2,1),
  rating_count  integer,

  -- money lost without eating; never spend
  risk          jsonb,
  a11y          jsonb,
  amenities     jsonb,
  parking       jsonb,
  dishes        jsonb,
  reputation    jsonb,
  map_uri       text,

  updated_at    timestamptz not null default now()
);

create index if not exists live_rows_point_idx on public.live_rows (lat, lng);
create index if not exists live_rows_hours_idx on public.live_rows ((hours is not null));

-- ── read access ───────────────────────────────────────────────────────────
-- The corpus is public reference data: anyone may read it, nobody may write it
-- through the anon key. Writes come from the pipeline with the service role,
-- which bypasses RLS.
alter table public.restaurants enable row level security;
alter table public.live_rows   enable row level security;

drop policy if exists "corpus is world readable" on public.restaurants;
create policy "corpus is world readable" on public.restaurants for select using (true);

drop policy if exists "live layer is world readable" on public.live_rows;
create policy "live layer is world readable" on public.live_rows for select using (true);

-- ── search across every region, without shipping every region ─────────────
--
-- Uses word_similarity, not similarity. `similarity` scores the query against
-- the WHOLE document, so a two-word query against a 200-character search_text
-- scores about 0.05 — below pg_trgm's 0.3 threshold — and every search returns
-- nothing. word_similarity scores the best-matching span instead, which is the
-- actual question being asked: does this phrase appear in this record.
create or replace function public.search_restaurants(q text, limit_n integer default 20)
returns table (
  slug text, title text, region text, region_group text,
  cuisine_tags text[], lat double precision, lng double precision, score real
)
language sql stable
set search_path = public, pg_temp
as $$
  select r.slug, r.title, r.region, r.region_group, r.cuisine_tags,
         l.lat, l.lng,
         word_similarity(q, r.search_text) as score
  from public.restaurants r
  left join public.live_rows l on l.slug = r.slug
  where q <% r.search_text
  order by score desc, r.title
  limit least(coalesce(limit_n, 20), 100);
$$;

-- ── nearest rooms to a point ──────────────────────────────────────────────
-- The other thing JSON cannot do: order 1094 records by distance from an
-- arbitrary origin without shipping all of them. Only rooms with a real
-- coordinate are returned; a city centroid would order every room in a metro
-- identically and imply a precision that is not there.
create or replace function public.nearby_restaurants(
  in_lat double precision,
  in_lng double precision,
  radius_mi double precision default 5,
  limit_n integer default 20
)
returns table (
  slug text, title text, region text, neighbourhood text,
  lat double precision, lng double precision, miles double precision
)
language sql stable
set search_path = public, pg_temp
as $$
  select r.slug, r.title, r.region, l.neighbourhood, l.lat, l.lng,
         point(l.lng, l.lat) <@> point(in_lng, in_lat) as miles
  from public.live_rows l
  join public.restaurants r on r.slug = l.slug
  where l.ll_source = 'exact'
    and l.lat is not null
    and (point(l.lng, l.lat) <@> point(in_lng, in_lat)) <= greatest(coalesce(radius_mi, 5), 0)
  order by miles
  limit least(coalesce(limit_n, 20), 100);
$$;
