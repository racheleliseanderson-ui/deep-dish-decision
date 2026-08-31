import { Chip, Eyebrow, Rule } from "@/components/rih/bits";
import { CompareDialog, CompareTray } from "@/components/rih/compare";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { Figure, GiltRule, Marquee, Vitrine } from "@/components/rih/gilt";
import { ListingFace } from "@/components/rih/listing-face";
import { RecordCard } from "@/components/rih/record-card";
import { ScenarioPlaybooks } from "@/components/rih/scenario-playbooks";
import { SituationConsole } from "@/components/rih/situation-console";
import heroPass from "@/assets/hero-pass.jpg";
import figGold from "@/assets/fig-gold.jpg";
import { isReadyRecord } from "@/lib/completeness";
import { corpusMeta, groupForRegion } from "@/lib/corpus-meta";
import type { RestaurantRecord } from "@/lib/dataset";
import {
  OPS,
  emptySituation,
  filterRecords,
  rank,
  situationDepth,
  SITUATION_SLOTS,
  type Situation,
} from "@/lib/intelligence";
import { useHideThinFiles } from "@/lib/prefs";
import { loadRegionGroup } from "@/lib/region-load";
import { decodeSituation, encodeSituation } from "@/lib/situation-url";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FadeKey, GrowBar, RankSlot, Reveal } from "@/components/rih/reveal";
import { ImportedContext } from "@/components/rih/imported-context";
import { useSaltyImport } from "@/hooks/use-salty-import";
import {
  planningDietBanner,
  situationFromHandoff,
  situationIsStarted,
} from "@/lib/salty-handoff/apply";
import { shouldApply } from "@/lib/salty-handoff/import-session.ts";

const CaseFile = lazy(() =>
  import("@/components/rih/case-file").then((m) => ({ default: m.CaseFile })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Restaurant Intelligence — why eat here, then confirm it" },
      {
        name: "description",
        content:
          "Describe the night. See why a room is worth going to, what it costs, and what you still need to confirm — from first-party evidence, not star ratings.",
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
  const [dietNote, setDietNote] = useState<string | null>(null);
  const appliedRef = useRef(false);
  const { session, apply, ignore } = useSaltyImport(
    "restaurant",
    situationIsStarted(situation),
    true,
  );

  useEffect(() => {
    if (appliedRef.current) return;
    if (!shouldApply(session) || !session.handoff) return;
    appliedRef.current = true;
    const incoming = session.handoff;
    setSituation((current) => situationFromHandoff(incoming, current));
    setDietNote(planningDietBanner(incoming));
    setLimit(8);
  }, [session]);
  const hideThin = useHideThinFiles();
  const [regionRecords, setRegionRecords] = useState<RestaurantRecord[] | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);

  const activeGroup =
    situation.regionGroup ?? (situation.region ? groupForRegion(situation.region) : null);
  const regionReady = Boolean(activeGroup);

  useEffect(() => {
    if (!activeGroup) {
      setRegionRecords(null);
      setRegionLoading(false);
      return;
    }
    let cancelled = false;
    setRegionLoading(true);
    loadRegionGroup(activeGroup).then((rows) => {
      if (cancelled) return;
      setRegionRecords(rows);
      setRegionLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  const ranked = useMemo(() => {
    if (!regionReady || !regionRecords) return [];
    const filtered = filterRecords(regionRecords, situation).filter((r) => {
      if (!hideThin.enabled) return true;
      return isReadyRecord(r.slug);
    });
    return rank(filtered, situation);
  }, [situation, hideThin.enabled, regionReady, regionRecords]);
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
      `${corpusMeta.count} records under review`,
      `${corpusMeta.fullCaseFiles ?? corpusMeta.count} complete case files`,
      `${corpusMeta.regions} regions`,
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
      <ImportedContext
        session={session}
        onApply={apply}
        onIgnore={ignore}
        applyLabel="Use this context"
      />
      <header className="relative isolate flex min-h-[70vh] items-end overflow-hidden border-b border-border-strong sm:min-h-[62vh]">
        <img
          src={heroPass}
          alt="An industrial dining room at service, plates finishing under low hanging lamps"
          width={1920}
          height={1088}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/85 via-ink/35 to-transparent" />

        <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-foreground/65">
            Salty & Clever · Restaurant Intelligence
          </p>
          <h1 className="display-statement mt-4 max-w-[20ch] text-ink-foreground">
            Why eat here —
            <br />
            <span className="text-primary">then confirm it.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-foreground/80 sm:text-lg">
            Start with the food, the room, and the night. We rank first-party evidence against
            your situation and show what you still need to ask before you book.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
              href="#situation"
              className="tap inline-flex min-h-11 items-center rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
            >
              Describe the night
            </a>
            <a
              href="#ranked"
              className="tap inline-flex min-h-11 items-center text-xs uppercase tracking-[0.16em] text-ink-foreground/75 underline decoration-1 underline-offset-8 transition-colors hover:text-ink-foreground"
            >
              See tonight's ranking
            </a>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-foreground/55">Records under review</p>
              <p className="text-num mt-1 text-2xl font-medium text-ink-foreground">{corpusMeta.count}</p>
              <p className="mt-1 text-xs text-ink-foreground/50">{corpusMeta.regions} regions · same 12-field floor</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-foreground/55">Official conflicts open</p>
              <p className="text-num mt-1 text-2xl font-medium text-critical">{OPS.officialConflicts}</p>
              <p className="mt-1 text-xs text-ink-foreground/50">Preserved, never collapsed</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-foreground/55">Average unknowns</p>
              <p className="text-num mt-1 text-2xl font-medium text-unknown">{OPS.avgUnknowns}</p>
              <p className="mt-1 text-xs text-ink-foreground/50">Held visible</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-foreground/55">Review overdue</p>
              <p className="text-num mt-1 text-2xl font-medium text-watch">{OPS.overdue}</p>
              <p className="mt-1 text-xs text-ink-foreground/50">{OPS.dueSoon} due soon</p>
            </div>
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
          <span className="text-eyebrow text-gilt">The room — start with why you would go</span>
        </figcaption>
      </figure>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        {dietNote ? (
          <p
            role="note"
            className="mb-6 rounded-xl border border-border bg-surface-raised/60 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground"
          >
            {dietNote}
          </p>
        ) : null}
        <SituationConsole
          situation={situation}
          onChange={(next) => {
            setSituation(next);
            setLimit(8);
          }}
          inViewCount={ranked.length}
          totalCount={regionRecords?.length ?? corpusMeta.count}
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
                <span className="text-eyebrow truncate">What works for tonight</span>
              </div>
              <GiltRule className="mt-3 max-w-xl" />
              <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Ordered for this night — fit, what still needs a call, and how complete the file is.
                Rooms that cannot meet a stated need drop to the bottom with the reason, instead of
                vanishing. Change the filters above and the list reorders live.
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
              {hideThin.enabled ? "Showing ready records" : "Hide thin records"}
            </button>
          </div>

          {ranked.length > 0 && depth < 3 ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface-sunken/55 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-xl">
                  <Eyebrow>Still a broad list</Eyebrow>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    Add an occasion or a guest need to sharpen what works for tonight. Records that
                    cannot meet a stated constraint stay visible at the bottom, with the reason.
                    Directory listings never rank these rooms.
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

          {!regionReady ? (
            <Vitrine className="mt-6 p-8 text-center sm:p-10">
              <Eyebrow>Choose a region first</Eyebrow>
              <GiltRule className="mx-auto mt-3 max-w-xs" />
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                The ranked list loads one region at a time so the home file stays light. Atlas still
                holds all {corpusMeta.count} records across {corpusMeta.regions} regions. Nothing is
                auto-selected — including Denver.
              </p>
            </Vitrine>
          ) : regionLoading ? (
            <Vitrine className="mt-6 p-8 text-center sm:p-10">
              <Eyebrow>Loading {activeGroup}</Eyebrow>
              <GiltRule className="mx-auto mt-3 max-w-xs" />
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Pulling the first-party files for this region. Ranking starts as soon as they land.
              </p>
            </Vitrine>
          ) : !ranked.length ? (
            <Vitrine className="mt-6 p-8 text-center sm:p-10">
              <Eyebrow>No matches</Eyebrow>
              <GiltRule className="mx-auto mt-3 max-w-xs" />
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
                Nothing in this region matches those filters. The instrument will not widen your
                constraints to produce a result — loosen cuisine or search, or pick another city.
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
                ["Records", String(corpusMeta.count)],
                ["Complete case files", String(corpusMeta.fullCaseFiles ?? corpusMeta.count)],
                ["Regions covered", String(corpusMeta.regions)],
                ["Still listing-only", String(corpusMeta.listingOnly ?? 0)],
                ["Open policy gaps", String(OPS.thinRecords)],
                ["Average unstated fields", String(OPS.avgThinFields)],
                ["Reachable by phone", String(OPS.reachableAtLastReview)],
                ["Last review pass", OPS.lastReviewAt],
                ["Corpus generated", corpusMeta.generatedAt],
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

      {openSc ? (
        <Suspense fallback={null}>
          <CaseFile
            sc={openSc}
            situation={situation}
            onClose={() => setOpenSlug(null)}
            packetHref={packetHref}
          />
        </Suspense>
      ) : null}
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
