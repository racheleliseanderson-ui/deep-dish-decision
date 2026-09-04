# Deep Dish local data pipeline

The three batch files now have separate jobs. Do not use one giant loop for all three concerns.

## RUNEXPANSION.bat — genuinely new restaurants

Use this when you want geographic growth. It rebuilds the density queue, chooses under-covered markets, uses Google Places Text Search only to surface candidate names/websites, verifies each candidate on the restaurant's own site, deduplicates against the corpus, then enriches only the restaurants that were actually inserted.

Requirements: put `GOOGLE_MAPS_API_KEY=...` in `.env.local` in the repository root. `.env.local` should remain gitignored.

Defaults: 3 cities per run, up to 20 accepted restaurants per city. Failed candidates are stored in `src/data/discovery-ledger.json` and cooled down instead of being retried every run.

## RUNREFRESH.bat — existing restaurants only

Use this to update what Deep Dish already knows. It uses the normal refresh priority model, but adds retry cooldowns and market diversification before calling `enrich.mjs` with explicit slugs.

Default batch: 30 records; initially no more than 4 per city before unused capacity is filled.

Failure cooldowns:

- no website / source limited: 30 days
- site failure: 2, 4, 7, 14, then 30 days as the failure streak grows
- empty / unresolved / deferred / error: 7 days
- successful but still thin/review-due: at least 7 days before another attempt

The selection report is written to `reports/refresh-plan-latest.json`.

## RUNSEEDING.bat — curated names only

Use this only after deliberately adding restaurant names to `scripts/data/seed-targets.json`. It resolves those names, inserts verified new records, and enriches only the new records from that run. It no longer launches general hygiene refresh work.

## Why finalize.mjs exists

Changes to `dataset.json` and `enrichment.json` are not enough. `finalize.mjs` first runs `level-records.mjs`, which promotes first-party website evidence into the standard case-file fields and writes an explicit honest “not published” floor where a criterion was actually checked but not stated. It then rebuilds the geographic queue, refresh queue, coverage/report data, live-region data, split enrichment files, slug index, atlas aggregates, and sitemaps before running corpus invariants.

## Recommended operating rhythm

- Expansion: run when you want coverage growth. Rebuild the queue each time.
- Refresh: run roughly twice per week or before a major release.
- Curated intake: run only when `seed-targets.json` has intentional new names.

The critical rule is separation: expansion should not be blocked by stale-site hygiene, and refresh should not consume the same failed records on every pass.
