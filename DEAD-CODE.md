# Dead code inventory — deep-dish-decision

As of **2026-09-02**. Nothing here has been deleted. Every file listed carries a
`// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md` comment at the top.

## How this was verified

Not from an earlier report. An import graph was built over every `.ts/.tsx` file
in `src/`, `tests/`, `scripts/` and `server/`, resolving relative and `@/`
specifiers, then walked from the real entry points: everything under
`src/routes/` (TanStack Start file-based routing), the generated `routeTree.gen.ts`,
`src/router.tsx`, `src/server.ts`, `src/start.ts`, plus all tests and scripts.
Anything the walk never reaches is listed below. For partly-dead files, every
exported symbol was separately searched for by name across the whole tree.

Two categories:

- **ORPHAN** — nothing anywhere imports it.
- **DEAD-ONLY** — it has importers, but every one of them is itself unreachable.
- **TEST-ONLY** — the only thing that imports it is its own test file. It is not
  in the shipped bundle.

## Unreachable modules

| file | lines | kind | what it was for | read |
| --- | ---: | --- | --- | --- |
| `src/components/rih/results-map.tsx` | 406 | ORPHAN | Map view of ranked results | Abandoned — no route ever mounted it |
| `src/components/rih/compare.tsx` | 392 | ORPHAN | Side-by-side restaurant comparison in a dialog | Abandoned |
| `src/components/rih/situation-console.tsx` | 296 | ORPHAN | The full situation-entry console (party, commitment, constraints) | Abandoned — the shipped route collects this inline |
| `src/components/rih/case-file.tsx` | 272 | ORPHAN | Long-form "case file" view of one restaurant | Abandoned — `record.$slug.tsx` is the view that shipped |
| `src/components/rih/night-summary.tsx` | 244 | ORPHAN | End-of-night summary of the decision | Paused — reads like a feature that was nearly finished |
| `src/components/rih/record-card.tsx` | 239 | ORPHAN | Card renderer for a restaurant in a result list | Abandoned — superseded by `listing-face.tsx` |
| `src/components/rih/where-and-when.tsx` | 234 | ORPHAN | Origin + time-window picker | Abandoned |
| `src/components/rih/evidence-band.tsx` | 119 | ORPHAN | "What this instrument can tell you tonight" band | Paused |
| `src/components/rih/evidence-from-photo.tsx` | 117 | ORPHAN | Upload a photo, extract findings via the vision model | Abandoned — the whole vision path is dark |
| `src/components/rih/decision-strip.tsx` | 113 | DEAD-ONLY | Compact decision line under a result | Reachable only through `record-card.tsx`, itself dead |
| `src/components/rih/scenario-playbooks.tsx` | 105 | ORPHAN | Preset "kind of night" playbooks | Abandoned |
| `src/components/rih/inspection-panel.tsx` | 83 | DEAD-ONLY | Health-inspection panel | Reachable only through `case-file.tsx`, itself dead |
| `src/components/rih/copy-night-link.tsx` | 51 | DEAD-ONLY | Copy a shareable URL encoding the Situation | Reachable only through `situation-console.tsx`, itself dead |
| `src/lib/playbooks.ts` | 181 | DEAD-ONLY | Data + matcher behind `scenario-playbooks.tsx` | Dies with its only consumer |
| `src/server/vision.ts` | 78 | DEAD-ONLY | Server fn calling Gemini for photo analysis | Dies with `evidence-from-photo.tsx` |
| `src/lib/vision.ts` | 78 | DEAD-ONLY | Vision result types + findings mapper | Dies with `evidence-from-photo.tsx` |
| `src/lib/scenario-chips.ts` | 70 | DEAD-ONLY | Situation-derived chips | Dies with `record-card.tsx` |
| `src/hooks/use-mobile.tsx` | 19 | DEAD-ONLY | Viewport breakpoint hook | Only `components/ui/sidebar.tsx` uses it, and the sidebar is not mounted |

Subtotal: **3,097 lines.**

## Test-only modules (present in the repo, absent from the bundle)

| file | lines | note |
| --- | ---: | --- |
| `src/lib/db.ts` | 272 | The whole Supabase client surface. Every export (`searchCorpus`, `savePlan`, `loadPlan`, `corpusCoverage`, …) is imported by `src/lib/db.test.ts` and by nothing else. **Paused, not abandoned** — the file's own header explains that Postgres is deliberately additive and the app must work without it, so this reads as a wired-but-unswitched-on feature. |
| `src/lib/db-config.ts` | 29 | Only consumed by `db.ts` (above) and the same test. |
| `src/lib/prefs.ts` | 136 | Contrast mode / locale / enrichment-signal / hide-thin-files preferences. 11 of its 13 exports have no reference anywhere; the remaining 2 (`ENRICHMENT_KEY`, `useEnrichmentSignals`) appear only in `src/lib/hydration.test.tsx`. The brief called this "most of `prefs.ts`" — it is in fact **all** of it. Paused: the storage keys suggest a settings panel that was never mounted. |

Subtotal: **437 lines.**

## Dead exports inside live files

These files are alive and must not be touched wholesale; only the named exports
are unreferenced.

| file | export | line | note |
| --- | --- | ---: | --- |
| `src/lib/enrichment.ts` | `buildEnrichmentFindings` | 263 | Confirmed unreferenced. Already carries its own inline `UNUSED as of 2026-09-02` note at line 259, so no marker was added to this file. |
| `src/lib/enrichment.ts` | `loadAllEnrichment` | 202 | Also unreferenced — not previously reported. |
| `src/lib/enrichment.ts` | 12 exported types | — | `EnrichmentRecord`, `EnrichmentGoogle`, `EnrichmentMeta`, `EnrichmentSite`, `EnrichmentSummary`, `GoogleAccessibility`, `GoogleAmenities`, `GoogleParking`, `OwnedQuote`, `OwnedQuoteGroup`, `SiteLanguage`, `SiteQuote` — all unreferenced outside the file. |
| `src/components/rih/gilt.tsx` | `Plinth` (33), `Figure` (67), `Marquee` (106) | — | 3 of 5 exports dead. `GiltRule` and `Vitrine` are live. |
| `src/components/rih/reveal.tsx` | `RankSlot` (141), `FadeKey` (214) | — | 2 of 5 exports dead. `Reveal`, `GrowBar`, `useReveal` are live. |

## Not listed on purpose

`src/components/ui/**` — 46 files, ~4,400 lines of the shadcn/ui kit, of which
only a handful are reached. That is a vendored component library, not abandoned
application code, and pruning it is a different decision from this one.
`src/lib/utils.ts` (the `cn` helper) is in the same bucket: 43 importers, all of
them inside that kit.

## Total

**3,534 lines** of unreferenced application code, across **21 files**, plus
~19 dead exports inside 3 live files.
