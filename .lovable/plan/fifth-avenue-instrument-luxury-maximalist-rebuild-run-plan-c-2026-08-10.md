# Fifth Avenue Instrument — luxury maximalist rebuild, run-plan controls, ethnic coverage

Three tracks: a maximalist luxury visual system, real interactive controls for pipeline runs (as a run-plan builder), and dataset work that lands at least 20 ethnic-cuisine records.

## 1. Luxury maximalist theme

Direction: Fifth Avenue at dusk — plate glass, brass, lacquer, deep ink, marble. Dense, layered, confidently colored. Not a beige document.

- Extend `src/styles.css` tokens: add a lacquered ink ground, brass/gilt accent, oxblood critical, marble/travertine surface tint, plus gradient and vignette tokens (`--gradient-gilt`, `--sheen-glass`, `--shadow-vitrine`). All in OKLCH, all wired through `@theme inline`, all working in light, dark, mono, and CVD modes.
- Typography hierarchy in four registers: oversized display serif (Newsreader) for statements, tight condensed uppercase eyebrows, IBM Plex Sans body, Plex Mono for every figure. Add display sizes up to clamp-based ~clamp(2.6rem, 7vw, 6.5rem) and deliberate line-break composition rather than centered paragraphs.
- New surface primitives in `src/components/rih/bits.tsx`: `Vitrine` (glass display case card with gilt hairline), `Marquee` (thin scrolling corpus ticker), `Plinth` (numbered section header with rule + index), `GiltRule`.
- Rebuild `src/routes/index.tsx` as a composed page, not hero-plus-cards: full-bleed ink opening with a huge broken-line statement and live corpus figures set into the type; a marquee of the newest records; an asymmetric situation console (console left, live ranked ledger right, overlapping at desktop); a dark "conflicts open" band; a gilt-on-ink closing plinth. Every section a different visual weight.
- Motion: keep the existing `Reveal`/`GrowBar` observers, add staggered children, gilt rule draw-in, and figure count-up. All respect `prefers-reduced-motion`.

## 2. Interactive pipeline run controls (run-plan builder)

The pipeline is workspace scripts over static JSON — the browser cannot launch a run, and the console will say so plainly rather than faking a Start button.

On `/console`, add a **Run planner** panel:
- Batch size stepper, cities-per-run stepper, cuisine focus selector, pause toggle, and a pinned-cities picker fed from `expansion-queue.json` (search + click to pin, drag-free reordering by priority buttons).
- Live projection: how many records the plan adds, which states it moves off zero, estimated call volume against the daily quota.
- Persist the plan to localStorage via a new `src/lib/run-plan.ts`, and render the exact command to run it (`bun scripts/pipeline/discover.mjs --plan=...`) with a copy button, plus a JSON export written for the operator.
- `scripts/pipeline/discover.mjs` and `build-queue.mjs` gain a `--plan` flag that reads an exported plan file, so what the UI composes is exactly what I execute when you ask.

Also on `/console`: interactive coverage map-grid (click a state to filter the ledger), sortable ledger columns, completeness threshold slider, and a run-history timeline with per-run deltas.

## 3. Layout, accessibility, functional flow

- Audit every route for one `<main>`, ordered headings, labelled controls, 44px targets, focus-visible rings on the new gilt surfaces, and contrast in all four color modes (the maximalist palette must still pass AA — I will check the new tokens, not assume them).
- Fix flow: hub → situation → ranked ledger → dossier → packet → night plan, with a persistent slim "night plan (n)" affordance so the funnel is never lost on mobile.
- Art-directed mobile recomposition: the overlap and asymmetry collapse into stacked full-bleed chapters, not squeezed columns.

## 4. Decision packet

Rebuild `/packet/$slug` as a genuine luxury document: gilt-ruled masthead, verdict set as a display statement, situation of record as a two-column register, findings by layer, confirmation script with checkboxes, evidence extract, sources and limits. Print stylesheet tuned for clean mono-ink output. Add a comparison packet mode for a shortlist (up to 3 rooms side by side) reachable from `/shortlist`.

Tone throughout: precise, dry, honest. Unknowns stay labelled unknown; no "hidden gem" language.

## 5. Ethnic-cuisine coverage (metro-anchored)

Current tags show only ~4 clearly ethnic-cuisine records (Korean 1, Thai 1, Caribbean 1, plus Eastern European 4). Target: **20+ minimum**.

Anchor discovery in NYC, LA, Houston, Chicago, and SF, running cuisine-specific queries — Mexican, Sichuan/Cantonese, Japanese, Korean, Thai, Vietnamese, Indian, Ethiopian, Lebanese, Filipino, Peruvian, Nigerian — 2–3 records per cuisine, deduped against existing records by place ID, phone, and fuzzy name. Every insert goes through the normal enrichment pass (Google Places core + Firecrawl site policies + AI summary) and lands with the same evidence labelling and completeness scoring as the rest of the corpus; anything that cannot be verified stays flagged, not invented. Then refresh `coverage.json` and finish the 15 records still awaiting enrichment.

## Technical notes

- No backend added; static JSON plus workspace scripts, per your earlier choice.
- New files: `src/lib/run-plan.ts`, run-planner component under `src/components/rih/`, packet-compare component.
- Touched: `src/styles.css`, `bits.tsx`, `index.tsx`, `console.tsx`, `packet.$slug.tsx`, `shortlist.tsx`, `record.$slug.tsx`, `atlas.tsx`, `guide.tsx`, `site-nav.tsx`, pipeline scripts for `--plan`.
- Verification: Playwright screenshots of desktop and mobile in all four color modes before I call it done.
