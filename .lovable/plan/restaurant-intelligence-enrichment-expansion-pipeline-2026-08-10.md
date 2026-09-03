# Restaurant Intelligence — enrichment + expansion pipeline

## Where we are

41 restaurant records live in a single committed file (`src/data/dataset.json`), all first-party, with unstated fields tracked as explicit unknowns. There is no database, no scheduler, and no external data connector in the project yet. Every derived number in the app (Atlas facets, gap map, depth scores) is counted from that file.

## One constraint to name up front

You chose to keep the static JSON. That works well for enrichment and for growing the corpus in reviewable batches, but a _self-running_ pipeline (nightly quota, retries across days, live admin controls that change future runs) needs a database and a server scheduler. So this plan delivers:

- A **repeatable batch pipeline** run from the workspace on request ("run the next batch"), with all state kept in committed JSON files — queue, run log, quotas, retries.
- A **Coverage Console** route in the app reading those same files: totals, coverage by state, completeness scores, recent additions, queue order.
- Pause / prioritize / batch-size controls as **queue-file settings** rather than live buttons.

When you want it fully autonomous, the same schema and job code moves to Lovable Cloud with scheduled jobs — no rework of the field model. Flagging that as the later step, not silently skipping it.

## Phase 1 — Enrich the existing 41 (no new restaurants)

Two connectors get linked first: **Google Maps Platform** (Places) and **Firecrawl**. Nothing runs before both are connected.

Per record, in batches of 10:

1. **Resolve identity** — Places Text Search on `title + city + state`, then Place Details. Accept a match only on name similarity plus proximity/address agreement; otherwise mark `matchStatus: "unresolved"` and leave the record untouched.
2. **Pull structured core** — formatted + component address, lat/lng, phone, website, price level, structured opening hours, rating, review count, amenity booleans (outdoor seating, delivery, takeout, reservations, wheelchair access, serves dinner, etc.).
3. **Scrape the restaurant's own site** with Firecrawl (homepage + menu/reservations pages) for menu URL, reservation link and platform, dietary and accessibility language, dress code, party-size and private-dining policy.
4. **Summarize** — a 2–3 sentence summary generated only from fields actually retrieved, with an explicit instruction that unstated things stay unstated.
5. **Stamp** `lastEnrichedAt`, per-field `source` and `retrievedAt`, and recompute completeness.

**Evidence separation (your choice):** third-party values never overwrite first-party fields. Each record gains a sibling block:

```text
record
├── (existing first-party fields, untouched)
└── enrichment
    ├── google:    { placeId, address components, latLng, hours, priceLevel,
    │                rating, reviewCount, amenities, retrievedAt }
    ├── site:      { menuUrl, reservationUrl, platform, dietary, accessibility,
    │                dressCode, groupPolicy, sourceUrls[], retrievedAt }
    ├── summary:   { text, model, basedOnFields[], generatedAt }
    └── meta:      { matchStatus, confidence, lastEnrichedAt, completeness }
```

The instrument keeps labelling which figures are first-party vs aggregated; unknowns only shrink when real evidence arrives.

**Gate:** after the first 2 batches I stop and show you **5 fully enriched records** plus a coverage delta (fields filled, unknowns closed, thin records resolved, unresolved matches). Nothing continues until you approve.

## Phase 2 — Expansion queue

A committed `expansion-queue.json` holding target metros in priority order with status and quota settings.

**Geographic order:** top 50 US metros by population → next 100 metros (500k+) → state capitals and any state with zero coverage → statewide fill for mid-size cities. Every state + DC gets a minimum floor so coverage isn't only coastal.

**Per run:** discover candidates in the next city via Places Nearby/Text Search across cuisine and price seeds, dedupe, insert, enrich immediately, log.

**Your controls (edit the queue file, or ask me):** `paused: true`, reorder or pin cities, `restaurantsPerRun`, `citiesPerRun`, and per-day caps.

**Starting quota (your choice, medium):** ~200 restaurants/day across 2–3 metros, run in batches of 25 with a hard daily ceiling recorded in the run log. No national scale-up until you say so.

## Phase 3 — Coverage Console

A new route in the app, matching the existing instrument art direction (full-bleed type, dynamic color fields, no dashboard-card grid):

- Total records, states covered of 51, records per 1M population
- A US coverage field — states rendered as an intensity map by record count and completeness, not a table
- Completeness distribution and the gap map, extended with enrichment coverage
- Recent additions and last-run ledger: batch size, cities touched, API calls, failures, retries
- Queue order with the active quota shown

## Deduplication

Layered, cheapest first:

1. Google `placeId` — hard unique key.
2. Normalized phone (E.164).
3. Normalized website host + path.
4. Normalized name (case, punctuation, `the`, `&`/`and`, legal suffixes) within 150 m of an existing lat/lng.
5. Fuzzy name similarity ≥ 0.9 within 500 m and same city → flagged for review, not auto-merged.

Chains and multi-location brands are kept as distinct records keyed by `placeId`; only exact `placeId` collisions merge. Merges union enrichment and keep the earliest first-party evidence.

## Rate limits, cost, freshness

- One in-flight request per provider with a small delay; exponential backoff with jitter on 429/5xx, max 4 retries, then the item goes back on the queue as `deferred`.
- Every run records call counts per provider so cost per 100 restaurants is measurable after batch one.
- Cost discipline: Place Details fields are requested with an explicit field mask (only what the schema needs); Firecrawl runs once per domain per refresh cycle; summaries are generated once and only regenerated when source fields change.
- Freshness tiers: hours/price/rating re-checked every 30 days; address/phone/website every 90; menus and policies every 120. Re-checks compete with new-city discovery under the same daily quota, refreshes first.

## Risks and guardrails

| Risk                                                      | Guardrail                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrong-business match pollutes a record                    | Match must clear name + location thresholds; failures marked `unresolved`, never guessed                                                         |
| Aggregator data eroding the first-party credibility model | Separate `enrichment` block, per-field source and timestamp, UI labels retained                                                                  |
| AI summary asserting facts not in evidence                | Summary generated only from a passed field list, stored with `basedOnFields` for audit                                                           |
| API spend running away                                    | Hard per-run and per-day ceilings in the queue file, field masks, logged call counts                                                             |
| Scraping terms and robots                                 | Firecrawl limited to each restaurant's own public site; aggregator pages are not scraped; Places data used through the official API only         |
| Quality drift as volume grows                             | Every run appends to the ledger with a completeness delta; a run whose average completeness drops below the corpus average is flagged for review |
| A bad batch corrupting the dataset                        | Each run writes a timestamped snapshot before edits, so any batch can be reverted                                                                |

## Technical notes

- Pipeline lives in `scripts/pipeline/` (discover, match, enrich, scrape, summarize, dedupe, report) writing to `src/data/dataset.json`, `src/data/enrichment/`, `expansion-queue.json`, and `src/data/run-log.json`.
- Google Places and Firecrawl are called through their Lovable connectors; keys are never placed in client code or committed files.
- `src/lib/dataset.ts` types extend with the optional `enrichment` block, so existing routes keep compiling untouched; `src/lib/atlas.ts` gains enrichment-aware facets.
- Summaries use the Lovable AI gateway.
- Phase 1 does not create records; Phase 2 is what inserts.
