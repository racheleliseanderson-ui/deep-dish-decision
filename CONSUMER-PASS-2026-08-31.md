# Deep Dish consumer intelligence pass — 2026-08-31

Canonical: `racheleliseanderson-ui/deep-dish-decision` @ `87c6ecb4` then this branch.
Production: https://deepdish.saltnotes.blog/
UI donor only (not copied): `deep-dish-decision-d5419fe5` (~225 records).
This is an improvement of the recovered hub. It is not a replacement application.

Grok App Builder overlay (`grokPwaPlugin`, `AuthProvider`, `PreviewHostBridge`, `public/__grok`) is sandbox-only. It must not ship to the Lovable Vercel project — it 500s SSR with `TypeError: __exportAll is not a function`.

## Recovered / preserved

| Surface                        | Count                                                        |
| ------------------------------ | ------------------------------------------------------------ |
| Canonical records              | **1094** (floor 800; recovered 836 then statewide F-01–F-15) |
| Regions                        | **167**                                                      |
| Enrichment files               | 125                                                          |
| Listing samples (context only) | 125                                                          |
| Researched reputation patterns | 32                                                           |
| Named first-party dishes       | 13                                                           |
| Health inspections             | 31                                                           |
| Documentary owned-site photos  | **29** (was 13 on `main`)                                    |

Kept: region-first ranking, fail-closed holds, 12-field case files, compare, playbooks, packets, HouseBar / Display / LabsFooter, hero `hero-pass.jpg` + `fig-gold.jpg`, pipeline under `scripts/pipeline/`. Directory ratings never rank. Empty stays empty. No authenticity claims from anonymous reviews.

Verified live: first load is region-null (“Choose a region first”). Denver is not auto-selected. Washington + Date night ranks Canlis as tonight’s lead with a first-party snapshot. Opening a case file shows Tonight → ten diner questions, first-party vs public-reputation layers, and no star-ranking engine.

## Ported from secondary repository

Already on production `main` from the earlier recovery: HouseBar, Display popover, LabsFooter, site nav, consumer hero hierarchy. This pass did not wholesale-copy the donor tree or its 225-record dataset.

## Consumer improvements

- Hero stats and ticker speak diner language: “Rooms on file”, “Open conflicts”, “Gaps still held open”, “Files due a fresh look”, “no star-rating ranking”.
- Ranked section remains “What works for tonight”; lead label is “Tonight’s lead”.
- Decision brief still answers “What you still need to ask” above confirmation burden.
- Before you choose it snapshot still extracts a decision point (not two dumped fields) and names first-party dishes only where pages already do.

## Food / reputation fields

| Field                                 | Populated   | Notes                                             |
| ------------------------------------- | ----------- | ------------------------------------------------- |
| Consumer snapshot (6 boxes)           | 1094 / 1094 | First-party extraction; open when silent          |
| Ten diner questions                   | 1094 / 1094 | Held-open when silent                             |
| Named signature dishes                | 13          | Owned-page language only                          |
| Public listing sample                 | 125         | Context; `rankingEligible: false`                 |
| Recurring praise / complaint patterns | 32          | Researched; not fabricated for the rest           |
| Health inspections                    | 31          | Official snapshots, labeled not a Deep Dish score |
| Documentary photography               | 29          | Restaurant-owned og:image; slug + hash QA         |

New owned-site photographs this pass (slug-matched, logos skipped): Canlis, Fraunces Tavern, Neptune Oyster, Franklin Barbecue, Uchiko, Au Cheval, Los Tacos No. 1, Nong’s Khao Man Gai, R&G Lounge, Palette Tea House, Guelaguetza, Philippe the Original, Uchi Dallas, Carbone Miami, Sanford Milwaukee, Sorella Milwaukee.

Dishes added vs `main`: Lucca’s house-made pasta, Civico 1845 house-made pasta, Campo Enoteca house-made pasta; Modern Apizza cleaned to “brick-oven pizza” (dropped “delicious”).

## Image coverage

29 documentary images. Cross-wire guard: `visual.slug` must equal `record.slug`; identical hashes across slugs are rejected. Identity SVG plate marks remain the fallback. Generated imagery is not used as documentary evidence.

## Tests added / run

- Vitest consumer + corpus suites: **27 passed** (snapshot, food intel, reputation not ranking-eligible, diner questions, visual slug QA, Washington date-night set).
- `npm run typecheck`: pass.
- `node scripts/corpus-invariants.mjs`: pass (1094 ≥ 800, 167 regions, hero assets, pipeline, schema).
- Desktop + mobile Playwright smoke on the live preview: 200, visible copy, no console errors, no horizontal overflow.
- Interactive: region-null first load; Washington + Date night ranking; case file Tonight tab with all 10 diner questions; no star-ranking engine.

## Data safeguards

`scripts/corpus-invariants.mjs` fails CI if count drops below 800, geography collapses, `dataset.json` / hero / core routes / pipeline disappear. Writes `reports/qa-coverage.json`. Override only with `ALLOW_CORPUS_MIGRATION=1`.

## Performance

Home no longer embeds the 6.8MB corpus. Atlas, guide, dossier, packet and night-plan load `dataset.json` from route loaders. Client `index` chunk **6,156 kB → 574 kB** (gzip 571 kB → 161 kB). Region groups stay split (`washington` 232 kB, `california` 502 kB, …) and load only after a region is chosen. Enrichment (2.2MB) remains a separate chunk for case files.

## Remaining research gaps

- Named dishes: 13 / 1094 — most owned pages never name a signature item.
- Researched review patterns: 32 / 1094 — will not be invented.
- Documentary photos: 29 / 1094 — many official sites publish only logos or no og:image.
- Inspections: 31, jurisdiction-limited.
- Sandbox Nitro preview of the Grok overlay still 500s (`__exportAll is not a function`). Production Lovable Vercel is the ship target; do not merge the overlay.

## Items deliberately not changed

- Ranking engine (fit, fail-closed constraints, confirm burden — never listing stars).
- Allergy inference rules.
- Donor dataset.
- Canonical `dataset.json` identity / count.
- Pipeline architecture.
- Auth / database (off).

## Production deployment commit

Not merged from this pass. Open a product-only PR (this file’s branch). Do not include Grok overlay files.
