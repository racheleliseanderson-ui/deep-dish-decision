# Deep Dish · database

Supabase project `supabase-chestnut-chair` (`pqbqvrmhbxowpqzcenod`).

## The design decision worth knowing

**The database does not replace the JSON.** The corpus still ships as
per-region files, and the ranked list still reads them. That is deliberate:

- the ranked list stays instant, with no network round trip per filter change
- a database outage cannot take the product down
- SSR keeps working without a database call on every request

Postgres is additive. It earns its place on the three things JSON cannot do:

|                        | why it needs a database                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search**             | look across all 1,094 records in 167 regions without shipping them to the browser. Today search only sees the one loaded region.               |
| **Night plans**        | a plan lives in one browser's localStorage. Lose the browser, lose the plan, and there is no way to send it to the people you are eating with. |
| **Enrichment history** | `enrichment.json` is one large file that churns in git, cannot be queried, and keeps no record of what was attempted or why it failed.         |

## Applying it

```sh
# in order
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_corpus.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_night_plans.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_enrichment.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0004_plan_id_is_the_capability.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0005_lock_down_maintenance.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0006_corpus_coverage.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0007_search_the_dishes.sql

# then load the corpus (idempotent — safe to re-run after any pipeline pass)
npm run db:seed:dry      # parse and report, write nothing
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run db:seed
```

All seven migrations are applied to `pqbqvrmhbxowpqzcenod` and were exercised
against PostgreSQL 16 with the full 1,094-record corpus before being committed.

## There is no sign-in

Nobody makes an account. Nobody logs in. Every visitor talks to Postgres as the
same anonymous role, and row-level security decides what that role may do:
read the corpus, save a night plan, fetch one plan by its full id. Nothing else.
That is the entire authorisation model, and it is the reason RLS had to be
right — see the second bug below.

Because of that, the connection details are checked into `src/lib/db-config.ts`
rather than configured per-deploy. The publishable key is public by design and
a Vite client ships it to every visitor in plain JavaScript no matter where it
came from; putting it in a dashboard setting would not make it secret, it would
only mean the app silently runs with no database whenever someone forgets —
which is precisely what happened. Environment variables still override it, so a
fork or a local stack can point elsewhere.

The **service key** is the opposite in every respect: it bypasses RLS entirely,
it belongs to the pipeline, and it must never be committed or given a `VITE_`
prefix.

## Keys

| variable                 | where             | notes                                                                        |
| ------------------------ | ----------------- | ---------------------------------------------------------------------------- |
| _(none required)_        | client            | defaults live in `src/lib/db-config.ts`                                      |
| `VITE_SUPABASE_URL`      | client            | optional override — must be a `*.supabase.co` host or it is refused outright |
| `VITE_SUPABASE_ANON_KEY` | client            | optional override                                                            |
| `SUPABASE_URL`           | server / pipeline |                                                                              |
| `SUPABASE_SERVICE_KEY`   | server / pipeline | **bypasses RLS.** Never in a `VITE_` variable, never committed.              |

Vercel needs nothing set. That is the point of checking the defaults in: the
Supabase integration injects `SUPABASE_URL` / `SUPABASE_ANON_KEY`, Vite only
exposes `VITE_`-prefixed variables to the browser, and the gap between those
two facts is a deploy that looks configured and quietly has no database.

With the database unreachable the app behaves exactly as it does today: `dbConfigured` is
false and every call returns an empty result without touching the network.
`src/lib/db.test.ts` asserts that.

## Seeding, and why coverage is reported

The JSON is the source of truth. Postgres now holds **all 1,094 records across
167 regions**, 1,003 of them with the corpus prose in `search_text`.

Loaded with `node scripts/db/seed-corpus.mjs` from a machine that can reach
Supabase. Note _node_, not npm: the seeder imports only node builtins and calls
global fetch, so a broken npm does not stop it — something that cost a couple
of failed attempts to work out.

A half-seeded database is more dangerous than an empty one. Search returns
_something_, so a restaurant that simply has not been loaded yet reads as one
Deep Dish has never heard of. `corpus_coverage` (0006) exposes the real number
and `coverageIsComplete()` refuses to call a partial index complete — including
when the check itself fails, because unknown must never resolve to "complete".
It now reports complete, but the guard stays: the corpus grows.

To load the rest, from a machine that can reach Supabase:

```powershell
$env:SUPABASE_URL="https://pqbqvrmhbxowpqzcenod.supabase.co"
$env:SUPABASE_SERVICE_KEY="<Settings -> API -> service_role>"
npm run db:seed:dry    # parses and reports, writes nothing
npm run db:seed        # idempotent
```

That path is better than the one used here, not just faster: it carries the
corpus prose into `search_text`, so search matches descriptions and not only
names, places and cuisine tags. The reconstruction used for the 258 never
overwrites prose that is already there.

## Row-level security

- **corpus** — world readable, no anon writes. The pipeline writes with the service role.
- **night plans** — insertable by anyone, and deliberately **not** updatable or deletable: a link you sent must not change under the recipient. Saving again mints a new id. Plans expire after 90 days.
  Reads go through `get_night_plan(plan_id)` and **`night_plans` has no `SELECT` policy at all** — see the second bug below.
- **maintenance** — `purge_expired_night_plans()` is service-role only. It is a job, not an endpoint.
- **enrichment** — no anon policy at all, so the anon key sees nothing. Operational history is not public.

## Two bugs worth recording

### Search matched nothing

`search_restaurants` first used `similarity()`, which scores the query against
the _whole_ document. A two-word query against a 200-character `search_text`
scores about 0.055 — below pg_trgm's 0.3 threshold — so **every search returned
nothing**. It uses `word_similarity` / `<%` now, which scores the best matching
span. Verified against the real corpus: "pink door" → The Pink Door, "barbecue"
→ Franklin, Jack Stack, Joe's KC.

### The plan id was not actually the capability

`0002` gave `night_plans` a `SELECT` policy of `expires_at > now()`. That reads
like "a plan is readable by its link", and it is not. Row-level security filters
_rows_; it never sees the _filter_ the client sent. So the policy said: any
holder of the publishable key may read every unexpired plan.
`GET /rest/v1/night_plans?select=*` returned all of them — every title, note and
origin label anyone had saved. The 22-character unguessable id was decoration on
a door that was standing open.

Caught by probing the live instance as the `anon` role rather than by reading
the migration, which had looked correct twice.

`0004` drops that policy, leaves the table with no read path at all, and adds
`get_night_plan(plan_id)` — `security definer`, requiring a full-length id up
front, returning at most one row. Verified on the live instance: a bare select
returns 0 rows, a prefix returns 0, `%` returns 0, the exact id returns 1.
`src/lib/db.test.ts` asserts the client never queries the table directly.

`0005` then revoked `purge_expired_night_plans()` from `anon` — the linter was
right that an unauthenticated endpoint which deletes rows and reports the count
was not something anyone had chosen.

### Search could not see the dishes

`search_restaurants` read only `restaurants.search_text` — name, place, cuisine
tags, summary prose. The 77 known-for dish names live in `live_rows.dishes` and
were invisible to it, so **"gumbo" returned nothing** while the database held
Dooky Chase's gumbo, and "lasagna" missed The Pink Door.

For a product that means to answer _what should we order_, a search that knows
the answer and says nothing is worse than one that never knew.

0007 matches dishes alongside the text and returns `matched_dish` — set only
when a dish is the actual reason a row appeared, so a result can say "known for
gumbo" instead of surfacing unexplained. Name and place still win where they
should: "pink door" returns The Pink Door with no dish attribution.

Dish coverage is thin — 77 names across 31 of 1,094 records. That is a data
gap, not a search gap, and it is what `pipeline:enrich` fills.
