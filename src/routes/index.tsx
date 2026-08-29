import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { CaseFile } from "@/components/rih/case-file";
import { CompareDialog, CompareTray } from "@/components/rih/compare";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { Figure, GiltRule, Marquee, Vitrine } from "@/components/rih/gilt";
import { ListingFace } from "@/components/rih/listing-face";
import { RecordCard } from "@/components/rih/record-card";
import { ScenarioPlaybooks } from "@/components/rih/scenario-playbooks";
import { SituationConsole } from "@/components/rih/situation-console";
import { SiteNav } from "@/components/rih/site-nav";
import heroPass from "@/assets/hero-pass.jpg";
import figGold from "@/assets/fig-gold.jpg";
import { dataset, records } from "@/lib/dataset";
import {
  OPS,
  emptySituation,
  filterRecords,
  rank,
  situationDepth,
  SITUATION_SLOTS,
  type Situation,
} from "@/lib/intelligence";
import { useEnrichmentSignals, useHideThinFiles } from "@/lib/prefs";
import { getEnrichment } from "@/lib/enrichment";
import { decodeSituation, encodeSituation } from "@/lib/situation-url";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FadeKey, GrowBar, RankSlot, Reveal } from "@/components/rih/reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Restaurant Intelligence Hub — Situation-Aware Decision Instrument" },
      {
        name: "description",
        content:
          "First-party restaurant evidence, ranked against your actual situation. No star ratings, unknowns stay visible, and a stated need the record cannot satisfy holds the booking.",
      },
      { property: "og:title", content: "Restaurant Intelligence Hub" },
      {
        property: "og:description",
        content:
          "Describe the night — occasion, party, constraints, lead time — and read decision briefs built only from first-party evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Hub,
});

function Hub() {
  // Shareable night-link query (?o=&p=&l=&c=…) wins on first paint.
  // Router searchStr is SSR-safe; malformed values are dropped by decodeSituation.
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [situation, setSituation] = useState<Situation>(() =>
    search ? decodeSituation(search) : emptySituation,
  );
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [limit, setLimit] = useState(8);
  const enrichment = useEnrichmentSignals();
  const hideThin = useHideThinFiles();
  const scoreOpts = useMemo(
    () => ({ useEnrichment: enrichment.enabled }),
    [enrichment.enabled],
  );

  const ranked = useMemo(() => {
    const filtered = filterRecords(records, situation).filter((r) => {
      if (!hideThin.enabled) return true;
      const completeness = getEnrichment(r.slug)?.meta?.completeness ?? 0;
      return completeness >= 70;
    });
    return rank(filtered, situation, scoreOpts);
  }, [situation, scoreOpts, hideThin.enabled]);
  const depth = situationDepth(situation);
  const depthPct = Math.round((depth / SITUATION_SLOTS) * 100);
  const lead = ranked[0] ?? null;
  const clear = ranked.filter((x) => !x.blocked && !x.criticals.length).length;
  const blocked = ranked.filter((x) => x.blocked).length;
  const openSc = ranked.find((x) => x.record.slug === openSlug) ?? null;
  const compared = compareSlugs
    .map((s) => ranked.find((x) => x.record.slug === s))
    .filter((x): x is NonNullable<typeof x> => !!x);

  const tickerItems = useMemo(
    () => [
      `${dataset.count} records under review`,
      `${dataset.records.filter((r) => r.isFullCaseFile).length} complete case files`,
      `${dataset.regions} regions`,
      `${OPS.officialConflicts} official conflicts open`,
      `${OPS.avgUnknowns} mean unknowns per record`,
      `${OPS.overdue} reviews overdue`,
      "same 12-field floor on every record",
      "no sentiment scores",
      "a stated need the record cannot satisfy holds the booking",
    ],
    [],
  );

  const packetHref = (slug: string) => {
    const q = encodeSituation(situation);
    return `/packet/${slug}${q ? `?${q}` : ""}`;
  };

  const toggleCompare = (slug: string) =>
    setCompareSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 3 ? prev : [...prev, slug],
    );

  return (
    <main className="min-h-screen pb-32">
      <header className="relative isolate overflow-hidden border-b border-border-strong">
        <img
          src={heroPass}
          alt="Industrial dining room under hanging lights — empty tables waiting for service"
          width={1800}
          height={1008}
          className="absolute inset-0 -z-10 size-full object-cover object-center opacity-[0.48]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/92 to-background/30" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-background to-transparent" />

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
          <SiteNav />

          <div className="mt-10 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
            <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">001</span>
            <span className="text-eyebrow truncate">Salty & Clever · Restaurant Intelligence</span>
          </div>
          <GiltRule className="mt-3" />

          <h1 className="display-statement mt-7 max-w-[19ch]">
            A decision instrument,
            <br />
            <span className="text-gilt">not a ratings board.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Every line here is read from first-party sources — the restaurant&apos;s own site, menu,
            reservation page, or a direct call. Nothing is scored on sentiment. Where the evidence
            stops, the record says so and stays open. When a constraint you have stated cannot be
            satisfied on the record, the booking is held rather than guessed.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Records under review" value={dataset.count} note={`${dataset.regions} regions · same 12-field floor`} />
            <Stat
              label="Official conflicts open"
              value={OPS.officialConflicts}
              note="Preserved, never collapsed"
              tone="critical"
            />
            <Stat
              label="Average unknowns per record"
              value={OPS.avgUnknowns}
              note="Held visible"
              tone="unknown"
            />
            <Stat
              label="Review overdue"
              value={OPS.overdue}
              note={`${OPS.dueSoon} due soon · last pass ${OPS.lastReviewAt}`}
              tone={OPS.overdue ? "watch" : "verified"}
            />
          </div>
        </div>
      </header>

      <Marquee items={tickerItems} />

      <figure className="relative isolate overflow-hidden border-b border-border-strong">
        <img
          src={figGold}
          alt="Wine glasses and golden light on an elegant dinner table"
          width={1400}
          height={933}
          className="h-44 w-full object-cover object-center sm:h-56"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-background/20 to-transparent" />
        <figcaption className="absolute bottom-4 left-4 sm:left-6">
          <span className="text-eyebrow text-gilt">The room · first-party evidence only</span>
        </figcaption>
      </figure>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <SituationConsole
          situation={situation}
          onChange={(next) => {
            setSituation(next);
            setLimit(8);
          }}
          inViewCount={ranked.length}
          totalCount={records.length}
        />

        <ScenarioPlaybooks
          situation={situation}
          onApply={(next) => {
            setSituation(next);
            setLimit(8);
          }}
        />

        {lead ? (
          <Reveal as="section" className="mt-12">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
              <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">002</span>
              <span className="text-eyebrow truncate">Lead reading</span>
            </div>
            <GiltRule className="mt-3" />

            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <FadeKey k={lead.record.slug} className="flex min-w-0 items-start gap-4">
                <ListingFace
                  record={lead.record}
                  rank={lead.rank}
                  fit={lead.fit}
                  burden={lead.burden}
                  size={64}
                  showGauges={false}
                />
                <div>
                  <h2 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                    {lead.record.title}
                  </h2>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    {lead.record.region} ·{" "}
                    {depth < 3
                      ? `situation ${depth}/${SITUATION_SLOTS} — this ordering is provisional`
                      : `situation ${depth}/${SITUATION_SLOTS}`}
                  </p>
                </div>
              </FadeKey>

              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[120px]">
                  <p className="text-eyebrow">Situation fit</p>
                  <p className="mt-1 flex items-baseline gap-1">
                    <Figure
                      key={`${lead.record.slug}-fit-${lead.fit}`}
                      value={lead.fit}
                      className="text-3xl font-medium text-primary"
                    />
                    <span className="text-num text-xs text-subtle">/100</span>
                  </p>
                </div>
                <div className="min-w-[140px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-eyebrow">Depth</p>
                    <p className="text-num text-xs text-subtle">
                      {depth}/{SITUATION_SLOTS}
                    </p>
                  </div>
                  <GrowBar
                    className="mt-2"
                    value={depthPct}
                    tone={depth < 3 ? "watch" : depth < 6 ? "primary" : "verified"}
                    live
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip tone="verified">
                    <span className="text-num">{clear}</span> clear on evidence
                  </Chip>
                  <Chip tone="critical">
                    <span className="text-num">{blocked}</span> held closed
                  </Chip>
                  <Chip tone="unknown">
                    <span className="text-num">{ranked.length}</span> in view
                  </Chip>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <FadeKey k={`${lead.record.slug}:${depth}:${lead.fit}`}>
                <DecisionBrief sc={lead} situation={situation} />
              </FadeKey>
            </div>
          </Reveal>
        ) : null}

        <section id="ranked" className="mt-14 scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
                <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">003</span>
                <span className="text-eyebrow truncate">Ranked against your situation</span>
              </div>
              <GiltRule className="mt-3 max-w-xl" />
              <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Order is a function of situation fit, confirm burden, first-party completeness and
                time pressure. Records blocked on a stated constraint are demoted to the end rather
                than removed, so you can see what was excluded and why. Refine the console above —
                the list reorders live.
              </p>
            </div>
            <button
              type="button"
              onClick={() => hideThin.set(!hideThin.enabled)}
              aria-pressed={hideThin.enabled}
              className={
                "tap shrink-0 rounded-full border px-4 py-2 text-xs transition-colors " +
                (hideThin.enabled
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground")
              }
            >
              {hideThin.enabled ? "Showing ready files (≥70%)" : "Hide files under 70%"}
            </button>
          </div>

          {ranked.length > 0 && depth < 3 ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface-sunken/55 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-xl">
                  <Eyebrow>Provisional ordering</Eyebrow>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    Situation depth {depth}/{SITUATION_SLOTS}. Add an occasion or guest constraint to
                    reshape fit, findings, and holds until a stated need is confirmed.
                    {enrichment.enabled
                      ? " Listing signals from other sources are on (reading controls)."
                      : " First-party evidence only."}
                  </p>
                </div>
                <div className="w-full max-w-[200px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-eyebrow">Depth</span>
                    <span className="text-num text-xs text-subtle">
                      {depth}/{SITUATION_SLOTS}
                    </span>
                  </div>
                  <GrowBar className="mt-2" value={depthPct} tone="watch" live />
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            {ranked.slice(0, limit).map((sc, i) => (
              <RankSlot key={sc.record.slug} id={sc.record.slug} rank={sc.rank}>
                <Reveal delay={Math.min(i * 40, 240)} as="div">
                  <RecordCard
                    sc={sc}
                    situation={situation}
                    onOpen={() => setOpenSlug(sc.record.slug)}
                    onCompare={() => toggleCompare(sc.record.slug)}
                    compared={compareSlugs.includes(sc.record.slug)}
                  />
                </Reveal>
              </RankSlot>
            ))}
          </div>

          {!ranked.length ? (
            <Vitrine className="mt-6 p-8 text-center sm:p-10">
              <Eyebrow>No matches</Eyebrow>
              <GiltRule className="mx-auto mt-3 max-w-xs" />
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Nothing in the corpus matches those filters. The instrument will not widen your
                constraints to produce a result — loosen geography, cuisine, or search above.
              </p>
            </Vitrine>
          ) : null}

          {limit < ranked.length ? (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 8)}
              className="tap mt-6 w-full rounded-xl border border-border bg-surface py-3.5 text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Show {Math.min(8, ranked.length - limit)} more of {ranked.length}
            </button>
          ) : null}
        </section>

        <Rule className="my-14" />

        <Reveal as="section" className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Method</Eyebrow>
            <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight">
              What this instrument refuses to do.
            </h2>
            <ul className="mt-5 space-y-3.5 text-[13px] leading-relaxed text-muted-foreground">
              <li>
                <span className="text-foreground">No star ratings, no aggregate sentiment.</span> A
                room is not a score. Fit is situational and shown with the reasoning that produced
                it.
              </li>
              <li>
                <span className="text-foreground">No inference dressed as fact.</span> If the
                restaurant has not stated it, the field reads unstated and stays in the unknown
                layer.
              </li>
              <li>
                <span className="text-foreground">No conflict smoothing.</span> Where two official
                sources disagree, both remain on the record and the record carries a critical flag.
              </li>
              <li>
                <span className="text-foreground">A stated allergy, access or private-room need that the record cannot satisfy holds the booking rather than guessing.</span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface-raised/40 p-5 sm:p-6">
            <Eyebrow>Corpus condition</Eyebrow>
            <dl className="mt-4 divide-y divide-border text-[13px]">
              {[
                ["Records", String(dataset.count)],
                ["Complete case files", String(dataset.records.filter((row) => row.isFullCaseFile).length)],
                ["Regions covered", String(dataset.regions)],
                ["Still listing-only", String(dataset.records.filter((row) => row.reviewStatus === "listing_only").length)],
                ["Open policy gaps", String(OPS.thinRecords)],
                ["Average unstated fields", String(OPS.avgThinFields)],
                ["Reachable by phone", String(OPS.reachableAtLastReview)],
                ["Last review pass", OPS.lastReviewAt],
                ["Corpus generated", dataset.generatedAt],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-num">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[12px] leading-relaxed text-subtle">
              Hours, pricing and reservation policy are the most volatile fields in the corpus.
              Confirm them live before you commit, regardless of how complete a record looks.
            </p>
          </div>
        </Reveal>
      </div>

      <CaseFile
        sc={openSc}
        situation={situation}
        onClose={() => setOpenSlug(null)}
        packetHref={packetHref}
      />
      <CompareTray
        items={compared}
        onRemove={(slug) => toggleCompare(slug)}
        onOpen={() => setCompareOpen(true)}
        onClear={() => setCompareSlugs([])}
      />
      <CompareDialog
        open={compareOpen && compared.length > 1}
        items={compared}
        situation={situation}
        onClose={() => setCompareOpen(false)}
      />
    </main>
  );
}
