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
psql "$SUPABASE_DB_URL" -f supabase/migrations/0004_plan_id_is_the_capability.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0005_lock_down_maintenance.sql

# then load the corpus (idempotent — safe to re-run after any pipeline pass)
npm run db:seed:dry      # parse and report, write nothing
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run db:seed
```

All five migrations are applied to `pqbqvrmhbxowpqzcenod` and were exercised
against PostgreSQL 16 with the full 1,094-record corpus before being committed.

## Keys

| variable | where | notes |
|---|---|---|
| `VITE_SUPABASE_URL` | client | publishable — `https://pqbqvrmhbxowpqzcenod.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | client | publishable, guarded by RLS |
| `SUPABASE_URL` | server / pipeline | |
| `SUPABASE_SERVICE_KEY` | server / pipeline | **bypasses RLS.** Never in a `VITE_` variable, never committed. |

**Vercel needs these set by hand.** The Supabase integration injects
`SUPABASE_URL` and `SUPABASE_ANON_KEY`, but Vite only exposes variables
prefixed `VITE_` to the browser, so the client sees nothing until
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist as their own Vercel
environment variables. This is the failure mode where everything looks
configured and search silently returns the loaded region forever.

With no keys set the app behaves exactly as it does today: `dbConfigured` is
false and every call returns an empty result without touching the network.
`src/lib/db.test.ts` asserts that.

## Row-level security

- **corpus** — world readable, no anon writes. The pipeline writes with the service role.
- **night plans** — insertable by anyone, and deliberately **not** updatable or deletable: a link you sent must not change under the recipient. Saving again mints a new id. Plans expire after 90 days.
  Reads go through `get_night_plan(plan_id)` and **`night_plans` has no `SELECT` policy at all** — see the second bug below.
- **maintenance** — `purge_expired_night_plans()` is service-role only. It is a job, not an endpoint.
- **enrichment** — no anon policy at all, so the anon key sees nothing. Operational history is not public.

## Two bugs worth recording

### Search matched nothing

`search_restaurants` first used `similarity()`, which scores the query against
the *whole* document. A two-word query against a 200-character `search_text`
scores about 0.055 — below pg_trgm's 0.3 threshold — so **every search returned
nothing**. It uses `word_similarity` / `<%` now, which scores the best matching
span. Verified against the real corpus: "pink door" → The Pink Door, "barbecue"
→ Franklin, Jack Stack, Joe's KC.

### The plan id was not actually the capability

`0002` gave `night_plans` a `SELECT` policy of `expires_at > now()`. That reads
like "a plan is readable by its link", and it is not. Row-level security filters
*rows*; it never sees the *filter* the client sent. So the policy said: any
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
