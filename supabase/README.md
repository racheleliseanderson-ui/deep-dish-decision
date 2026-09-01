# Deep Dish · database

Supabase project `supabase-chestnut-chair` (`pqbqvrmhbxowpqzcenod`).

## The design decision worth knowing

**The database does not replace the JSON.** The corpus still ships as
per-region files, and the ranked list still reads them. That is deliberate:

- the ranked list stays instant, with no network round trip per filter change
- a database outage cannot take the product down
- SSR keeps working without a database call on every request

Postgres is additive. It earns its place on the three things JSON cannot do:

| | why it needs a database |
|---|---|
| **Search** | look across all 1,094 records in 167 regions without shipping them to the browser. Today search only sees the one loaded region. |
| **Night plans** | a plan lives in one browser's localStorage. Lose the browser, lose the plan, and there is no way to send it to the people you are eating with. |
| **Enrichment history** | `enrichment.json` is one large file that churns in git, cannot be queried, and keeps no record of what was attempted or why it failed. |

## Applying it

```sh
# in order
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_corpus.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_night_plans.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0003_enrichment.sql

# then load the corpus (idempotent — safe to re-run after any pipeline pass)
npm run db:seed:dry      # parse and report, write nothing
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run db:seed
```

All three migrations were applied and exercised against PostgreSQL 16 with the
full 1,094-record corpus loaded before being committed.

## Keys

| variable | where | notes |
|---|---|---|
| `VITE_SUPABASE_URL` | client | publishable |
| `VITE_SUPABASE_ANON_KEY` | client | publishable, guarded by RLS |
| `SUPABASE_URL` | server / pipeline | |
| `SUPABASE_SERVICE_KEY` | server / pipeline | **bypasses RLS.** Never in a `VITE_` variable, never committed. |

With no keys set the app behaves exactly as it does today: `dbConfigured` is
false and every call returns an empty result without touching the network.
`src/lib/db.test.ts` asserts that.

## Row-level security

- **corpus** — world readable, no anon writes. The pipeline writes with the service role.
- **night plans** — readable by anyone holding the id, insertable by anyone, and deliberately **not** updatable or deletable: a link you sent must not change under the recipient. Saving again mints a new id. Plans expire after 90 days; `purge_expired_night_plans()` is safe to schedule.
- **enrichment** — no anon policy at all, so the anon key sees nothing. Operational history is not public.

## One bug worth recording

`search_restaurants` first used `similarity()`, which scores the query against
the *whole* document. A two-word query against a 200-character `search_text`
scores about 0.055 — below pg_trgm's 0.3 threshold — so **every search returned
nothing**. It uses `word_similarity` / `<%` now, which scores the best matching
span. Verified against the real corpus: "pink door" → The Pink Door, "barbecue"
→ Franklin, Jack Stack, Joe's KC.
