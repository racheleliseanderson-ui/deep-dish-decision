# Deep Dish comparison report — consumer intelligence pass

Date: 2026-08-30
Branch: `feat/consumer-intelligence-2026-08-30`
Base: last healthy production `d9ffee349af430dc9c72e0521bf5c5da5e738013`
Not used as data: `deep-dish-decision-d5419fe5` (~225 records, UI donor only)
Preserved: `backup/grok-rebuild-2026-08-28`

This is an improvement of the recovered 836-record hub. It is not a replacement application.

## Record count before / after

| Surface | Records | Regions | Dataset |
|---|---|---|---|
| Broken `main` (`ebdca89`) | ~30 confirmation-pass rows in `restaurants.ts` | Denver-centric demo | `dataset.json` missing |
| Last healthy (`d9ffee3`) | **836** | **122** | `src/data/dataset.json` |
| This branch | **836** | **122** | same corpus, generated `2026-08-28T03:27:08.444Z` |

Invariant: CI / `npm run check:corpus` fails if count drops below 800, if `dataset.json` disappears, if hero assets disappear, or if core routes/pipeline files disappear. Override only with `ALLOW_CORPUS_MIGRATION=1`.

## Routes before / after

Kept: `/`, `/guide`, `/atlas`, `/console`, `/shortlist`, `/record/$slug`, `/packet/$slug`.
No routes removed. HouseBar + LabsFooter now wrap every route (ported from the UI donor). Per-page `SiteNav` strips removed so chrome is not doubled.

## Components removed

None of the recovered intelligence components were removed (`case-file`, `compare`, `decision-brief`, `situation-console`, `scenario-playbooks`, pipeline, packet PDF).

## Data files removed

None. Canonical `src/data/dataset.json` is unchanged in count and identity.

Added (empty / schema only, no fabricated facts):

- `src/data/visual-program.json` — provenance-tagged photography (currently 0 documentary images)
- `src/data/reputation-patterns.json` — researched review patterns (currently 0 records)

## Image assets

Kept: `src/assets/hero-pass.jpg`, `src/assets/fig-gold.jpg`.
Added: `public/og.jpg` (licensed hero, share card).
Restaurant photography: **0 documentary images**. Identity marks remain the visual fallback. Cross-wired photos cannot render (`visual.slug` must equal `record.slug`).

## Pipelines

Kept: `scripts/pipeline/*` (discover, enrich, refresh, report, retire, seed, source-limited, owned-fetch).
Added: `scripts/corpus-invariants.mjs` (+ test).

## Functionality lost

None verified. Ranking, fail-closed constraints, compare, packets, playbooks, situation URL, enrichment-as-labeled-third-party, and the 12-field case file remain.

## Functionality added

- Editorial 70vh hero: “Why eat here — then confirm it.” Full-opacity licensed dining-room photograph.
- Consumer snapshot extracts a decision point instead of dumping two fields.
- Tonight tab: ten ordinary-diner questions, sources labeled.
- Food intel layer (`firstPartyEvidence`) derived from restaurant-owned fields only.
- Public reputation layer (`publicReputationEvidence`) held apart from first-party facts. Directory ratings are context; they never rank.
- Visual program with provenance + slug matching.
- HouseBar / Display popover / LabsFooter from the UI donor.
- Data-governance guards so a 30-restaurant confirmation pass cannot overwrite this hub again.

## Coverage of new fields (derived, not invented)

| Field | Populated | Notes |
|---|---|---|
| Consumer snapshot (6 boxes) | 836 / 836 | First-party extraction |
| Diner questions (10) | 836 / 836 | Held-open when silent |
| Food intel / culinary identity | 836 / 836 | From `cuisineContext` / menu |
| Named signature dishes | only where pages say “signature / known for” | Not invented |
| Public listing sample (Google rating + n) | 111 / 836 | Context only, not ranking |
| Google listing editorial blurb | 88 / 836 | Labeled third-party, not consensus |
| Recurring praise / complaint patterns | 0 / 836 | Empty until a research pass |
| Documentary restaurant photography | 0 / 836 | Architecture ready; no random stock |
| Identity marks | 836 / 836 | Deterministic SVG, labeled as not a photo |
| Owned-site quotes | 826 / 836 | Existing enrichment |

## Tests added

- `src/lib/consumer-snapshot.test.ts`
- `src/lib/corpus-invariants.test.ts`
- `scripts/corpus-invariants.mjs` + `scripts/corpus-invariants.test.mjs`
- Existing owned-site, packet, hydration, pipeline tests still run

## Items deliberately not changed

- Ranking engine (no star scores, no reputation in `rank()`)
- Fail-closed allergy / access / private-room holds
- 836-record corpus, regions, pipeline outputs
- Method/evidence language on Method views
- Donor dataset (225 records) was not copied

## Remaining research gaps

- Recurring praise/complaint patterns require a review-text research pass (not fabricated here).
- Documentary photography of specific restaurants requires restaurant-owned or licensed ingest with slug QA.
- Health-inspection data is not in the corpus; cleanliness stays held-open.
- Home JS payload is still large (~corpus JSON). Pagination is 8-at-a-time; a later split would help TTI without shrinking the hub.

## Production

Verified locally: typecheck, production build, corpus invariants, desktop + mobile smoke, Washington date-night (33 in view, Canlis lead), Canlis record, atlas 836 / 122. Neutral first load does not select Denver.
