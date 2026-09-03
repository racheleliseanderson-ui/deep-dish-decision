import heroPass480 from "@/assets/hero-pass-480.webp";
import heroPass768 from "@/assets/hero-pass-768.webp";
import heroPass1200 from "@/assets/hero-pass-1200.webp";
import heroPass1800 from "@/assets/hero-pass-1800.webp";
import { DecisionCard, decisionState } from "@/components/rih/decision-card";
import { CrossContactView } from "@/components/rih/cross-contact-view";
import { DecisionWorkflow } from "@/components/rih/decision-workflow";
import { ImportedContext } from "@/components/rih/imported-context";
import { QuickStart } from "@/components/rih/quick-start";
import { RegionDepth } from "@/components/rih/region-depth";
import { readRegionDepth } from "@/lib/region-depth";
import { RefineNight } from "@/components/rih/refine-night";
import { useSaltyImport } from "@/hooks/use-salty-import";
import { corpusMeta, groupForRegion } from "@/lib/corpus-meta";
import type { RestaurantRecord } from "@/lib/dataset";
import {
  emptySituation,
  filterRecords,
  rank,
  type Situation,
} from "@/lib/intelligence";
import { loadLiveGroup, type LiveRow } from "@/lib/live";
import { findNearestRegionGroup } from "@/lib/nearest-region";
import {
  emptyNightDetails,
  clearNightContext,
  readNightContext,
  saveNightContext,
  type NightDetails,
  type StoredNightContext,
} from "@/lib/night-context";
import { useOrigin } from "@/lib/origin";
import { loadRegionGroup } from "@/lib/region-load";
import { useShortlist } from "@/lib/shortlist";
import {
  planningDietBanner,
  situationFromHandoff,
  situationIsStarted,
} from "@/lib/salty-handoff/apply";
import { shouldApply } from "@/lib/salty-handoff/import-session.ts";
import { decodeSituation } from "@/lib/situation-url";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

const HERO_SRCSET = [
  `${heroPass480} 480w`,
  `${heroPass768} 768w`,
  `${heroPass1200} 1200w`,
  `${heroPass1800} 1800w`,
].join(", ");

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deep Dish — is this restaurant right for this night?" },
      {
        name: "description",
        content:
          "Say where, what kind of night, and what cannot go wrong. Get a restaurant, the unknowns that still matter, and a script for the call that closes them.",
      },
      { property: "og:title", content: "Deep Dish — decide, verify, then book" },
      {
        property: "og:description",
        content:
          "Restaurant fit for a particular night — plus what still needs to be verified before you book.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Hub,
});

/** The stored night in one clause, so nobody resumes a thing they cannot see. */
function resumeLine(s: Situation): string {
  const parts: string[] = [];
  if (s.occasion) parts.push(s.occasion.toLowerCase());
  if (s.partySize != null) parts.push(`for ${s.partySize}`);
  const where = s.region ?? s.regionGroup;
  if (where) parts.push(`in ${where}`);
  if (s.constraints.length) parts.push(`with ${s.constraints.join(" and ").toLowerCase()} on the line`);
  if (!parts.length && s.query.trim()) parts.push(`a search for \u201c${s.query.trim()}\u201d`);
  return parts.length ? `a night half-answered — ${parts.join(", ")}` : "a night you started answering";
}

function Hub() {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [situation, setSituation] = useState<Situation>(() =>
    search ? decodeSituation(search) : { ...emptySituation },
  );
  const [details, setDetails] = useState<NightDetails>({ ...emptyNightDetails });
  const [started, setStarted] = useState(() =>
    situationIsStarted(search ? decodeSituation(search) : { ...emptySituation }),
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [limit, setLimit] = useState(8);
  const [dietNote, setDietNote] = useState<string | null>(null);
  /*
   * The night this browser was last working on.
   *
   * It was already being written on every change and never read back, so a
   * second visit meant answering the same five questions again. It is offered
   * rather than applied: a night from last Tuesday quietly restoring itself
   * over a fresh arrival is worse than a blank form, and the reader can see
   * what they are picking up before they pick it up.
   */
  const [resumable, setResumable] = useState<StoredNightContext | null>(null);
  const [regionRecords, setRegionRecords] = useState<RestaurantRecord[] | null>(null);
  const [liveRows, setLiveRows] = useState<Record<string, LiveRow> | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [nearMeResolving, setNearMeResolving] = useState(false);
  const [nearMeError, setNearMeError] = useState<string | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  /* Bumped by the retry button. `activeGroup` is a string, so re-selecting the
     same city would not re-run the loader on its own — a "try again" that does
     nothing is worse than no button at all. */
  const [regionAttempt, setRegionAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const appliedRef = useRef(false);
  const originState = useOrigin();
  const shortlist = useShortlist();

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
    setStarted(true);
    setLimit(8);
  }, [session]);

  useEffect(() => {
    const origin = originState.origin;
    if (!origin || origin.kind !== "device" || situation.regionGroup) return;

    let cancelled = false;
    setNearMeResolving(true);
    setNearMeError(null);
    findNearestRegionGroup(origin.ll)
      .then((match) => {
        if (cancelled) return;
        if (!match) {
          setNearMeError("Deep Dish could not find nearby coverage yet. Choose a city instead.");
          return;
        }
        setSituation((current) => ({
          ...current,
          regionGroup: match.group,
          region: null,
          origin: origin.ll,
          originLabel: origin.label,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setNearMeError("Deep Dish could not search near that location. Choose a city instead.");
        }
      })
      .finally(() => {
        if (!cancelled) setNearMeResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [originState.origin, situation.regionGroup]);

  useEffect(() => {
    const origin = originState.origin;
    if (!origin) return;
    setSituation((current) =>
      current.origin && current.origin[0] === origin.ll[0] && current.origin[1] === origin.ll[1]
        ? current
        : { ...current, origin: origin.ll, originLabel: origin.label },
    );
  }, [originState.origin]);

  useEffect(() => {
    if (started) saveNightContext(situation, details);
  }, [started, situation, details]);

  useEffect(() => {
    // Only when this visit arrived with nothing of its own — a shared link or a
    // handoff packet is about tonight and outranks a remembered night.
    if (search || situationIsStarted(situation)) return;
    const stored = readNightContext();
    if (situationIsStarted(stored.situation)) setResumable(stored);
    // Mount only: this asks what the reader arrived with, not what they typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeGroup =
    situation.regionGroup ?? (situation.region ? groupForRegion(situation.region) : null);
  const regionReady = Boolean(activeGroup);

  useEffect(() => {
    if (!activeGroup) {
      setRegionRecords(null);
      setLiveRows(null);
      setRegionLoading(false);
      return;
    }

    let cancelled = false;
    setRegionLoading(true);
    setRegionError(null);
    Promise.all([loadRegionGroup(activeGroup), loadLiveGroup(activeGroup)])
      .then(([records, live]) => {
        if (cancelled) return;
        setRegionRecords(records);
        setLiveRows(live);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // An empty region reads as "no rooms here", which is a different claim
        // from "the region file did not load". Say the second one.
        console.error(`Region group "${activeGroup}" failed to load`, error);
        setRegionRecords([]);
        setLiveRows(null);
        setRegionError("This region could not be loaded. Reload the page, or choose another city.");
      })
      .finally(() => {
        if (!cancelled) setRegionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeGroup, regionAttempt]);

  // `now` is a dependency of scoreOpts, which is a dependency of the `ranked`
  // memo, so a tick re-scored the whole region. Open/closed state does not move
  // second to second: commit only when the five-minute slot actually changes.
  useEffect(() => {
    const SLOT_MS = 5 * 60_000;
    const slot = (d: Date) => Math.floor(d.getTime() / SLOT_MS);
    const id = window.setInterval(() => {
      const next = new Date();
      setNow((current) => (slot(current) === slot(next) ? current : next));
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const scoreOpts = useMemo(() => ({ live: liveRows ?? undefined, now }), [liveRows, now]);

  const ranked = useMemo(() => {
    if (!regionReady || !regionRecords) return [];
    return rank(filterRecords(regionRecords, situation, liveRows ?? undefined), situation, scoreOpts);
  }, [regionReady, regionRecords, situation, liveRows, scoreOpts]);

  const selected = selectedSlug
    ? ranked.find((item) => item.record.slug === selectedSlug) ?? null
    : null;

  /* The region group Deep Dish knows best, computed from the slug index rather
     than hard-coded, so the worked example moves when the corpus does. */
  const bestCovered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of corpusMeta.slugIndex) {
      counts.set(entry.regionGroup, (counts.get(entry.regionGroup) ?? 0) + 1);
    }
    let best: { group: string; count: number } | null = null;
    for (const [group, count] of counts) {
      if (!best || count > best.count) best = { group, count };
    }
    return best;
  }, []);

  /*
   * Why the list came back empty.
   *
   * Nothing here is a hard constraint — constraints sink a room in the ranking,
   * they do not delete it — so an empty list is always one of five filters
   * doing it. Rather than telling the reader to "try adjusting your filters",
   * re-run the same filter with each one lifted and report which lift brings
   * how many rooms back. It costs one pass over a region file already in memory.
   */
  const emptyDiagnosis = useMemo(() => {
    if (!regionReady || !regionRecords || regionLoading || ranked.length > 0) return null;
    const inRegion = regionRecords.length;
    const relax = (patch: Partial<Situation>) =>
      filterRecords(regionRecords, { ...situation, ...patch }, liveRows ?? undefined).length;
    const lifts: { label: string; count: number; patch: Partial<Situation>; action: string }[] = [];
    if (situation.query.trim()) {
      lifts.push({
        label: `the words \u201c${situation.query.trim()}\u201d`,
        count: relax({ query: "" }),
        patch: { query: "" },
        action: "Clear the search",
      });
    }
    if (situation.cuisine) {
      lifts.push({
        label: `the ${situation.cuisine} filter`,
        count: relax({ cuisine: null }),
        patch: { cuisine: null },
        action: `Drop ${situation.cuisine}`,
      });
    }
    if (situation.radiusMi) {
      lifts.push({
        label: `the ${situation.radiusMi}-mile radius`,
        count: relax({ radiusMi: null }),
        patch: { radiusMi: null },
        action: "Let distance inform instead of exclude",
      });
    }
    if (situation.openOnly) {
      lifts.push({
        label: "the serving-then filter",
        count: relax({ openOnly: false }),
        patch: { openOnly: false },
        action: "Include rooms with no published hours",
      });
    }
    if (situation.region) {
      lifts.push({
        label: `${situation.region} on its own`,
        count: relax({ region: null }),
        patch: { region: null },
        action: `Widen to all of ${activeGroup ?? "the region"}`,
      });
    }
    lifts.sort((a, b) => b.count - a.count);
    return { inRegion, best: lifts.find((lift) => lift.count > 0) ?? null };
  }, [regionReady, regionRecords, regionLoading, ranked.length, situation, liveRows, activeGroup]);

  /* Shallow enough that the length of the list needs saying out loud. */
  const depthIsLean = useMemo(() => {
    const read = readRegionDepth(situation.region, activeGroup);
    return read ? read.band === "single" || read.band === "shallow" : false;
  }, [situation.region, activeGroup]);

  const runWorkedExample = () => {
    if (!bestCovered) return;
    setSituation({
      ...emptySituation,
      occasion: "Date night",
      partySize: 2,
      leadDays: 3,
      regionGroup: bestCovered.group,
    });
    setDetails({ ...emptyNightDetails });
    submit();
  };

  // Saying "allergy / celiac" is the one answer that changes what the list is
  // for. It stops being a fit ranking and becomes a question about published
  // kitchen practice, so it gets sorted and labelled by that instead.
  const crossContactFocus = situation.constraints.includes("Severe allergy / celiac");

  const patch = (next: Partial<Situation>) => {
    setSituation((current) => ({ ...current, ...next }));
    setLimit(8);
  };

  const submit = () => {
    setStarted(true);
    setLimit(8);
    window.requestAnimationFrame(() => {
      document.getElementById("ranked")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const nextBest = () => {
    if (!ranked.length) {
      setSelectedSlug(null);
      return;
    }
    const currentIndex = selectedSlug
      ? ranked.findIndex((item) => item.record.slug === selectedSlug)
      : -1;
    const after = ranked.slice(Math.max(0, currentIndex + 1));
    const next = after.find((item) => decisionState(item) !== "hold") ?? after[0] ?? ranked[0];
    setSelectedSlug(next?.record.slug ?? null);
  };

  return (
    <main id="main" tabIndex={-1} className="min-h-screen pb-28">
      <ImportedContext
        session={session}
        onApply={apply}
        onIgnore={ignore}
        applyLabel="Use this context"
      />

      <header className="relative isolate flex min-h-[38vh] items-end overflow-hidden border-b border-border-strong sm:min-h-[42vh]">
        <img
          src={heroPass480}
          srcSet={HERO_SRCSET}
          sizes="100vw"
          alt="Rows of bare filament bulbs hanging low over long empty wooden tables in a dining room before service."
          width={1800}
          height={1008}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/75 to-ink/25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/90 via-ink/45 to-transparent" />

        <div className="mx-auto w-full max-w-7xl px-4 pb-9 pt-20 sm:px-6 sm:pb-11 sm:pt-22">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-foreground/65">
            Salty & Clever · Deep Dish
          </p>
          <h1 className="display-statement mt-3 max-w-[18ch] text-ink-foreground">
            Is this restaurant right for
            <span className="text-primary"> this particular night?</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-foreground/82 sm:text-lg">
            Find the fit, close the important unknowns, then book with the loose ends handled.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
        {dietNote ? (
          <p role="note" className="mb-6 rounded-xl border border-border bg-surface-raised/60 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
            {dietNote}
          </p>
        ) : null}

        {resumable && !started ? (
          <section className="mb-6 rounded-2xl border border-gilt/45 bg-surface-raised/60 p-5 sm:p-6">
            <p className="text-eyebrow text-gilt">Where you left off</p>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed">
              This browser still has {resumeLine(resumable.situation)}. Pick it back up and the
              ranking runs on it without you answering anything twice.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSituation({ ...resumable.situation });
                  setDetails({ ...resumable.details });
                  setResumable(null);
                  submit();
                }}
                className="tap rounded-xl border border-gilt bg-surface px-5 py-3 text-sm transition-colors hover:bg-surface-raised"
              >
                Pick it back up
              </button>
              <button
                type="button"
                onClick={() => {
                  setResumable(null);
                  clearNightContext();
                }}
                className="tap rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                Forget it, this is a different night
              </button>
            </div>
          </section>
        ) : null}

        <QuickStart
          situation={situation}
          details={details}
          onChange={(next) => {
            setSituation(next);
            setLimit(8);
          }}
          onDetailsChange={setDetails}
          originState={originState}
          nearMeResolving={nearMeResolving}
          nearMeError={nearMeError}
          onSubmit={submit}
        />

        {started ? <RefineNight situation={situation} patch={patch} /> : null}

        <section id="ranked" className="mt-10 scroll-mt-24">
          {!started ? (
            /* First visit, nothing answered. The page used to end here — a form
               and then whitespace, which teaches nobody what the form is for. */
            <div className="rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8">
              <p className="text-eyebrow text-gilt">Before you answer anything</p>
              <p className="mt-2 font-display text-2xl leading-tight sm:text-3xl">
                Answer the two questions above and this fills with rooms, ranked for that night.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Each one arrives with its fit, the fields nobody has ever stated, and the exact
                question to ask on the phone to close them. Where a restaurant has never published
                an answer, this leaves the field blank and hands you the question — it does not fill
                the hole with something plausible. Empty is a finding.
              </p>
              {bestCovered ? (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={runWorkedExample}
                    className="tap rounded-xl border border-gilt bg-surface px-5 py-3 text-sm text-foreground transition-colors hover:bg-surface-raised"
                  >
                    Show me one worked out — {bestCovered.group}, two people, Thursday
                  </button>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Loads a real situation against the{" "}
                    <span className="text-num">{bestCovered.count}</span> files Deep Dish holds in{" "}
                    {bestCovered.group}. Nothing is saved and every answer stays editable.
                  </p>
                </div>
              ) : null}
            </div>
          ) : !regionReady ? (
            <div className="rounded-2xl border border-watch/35 bg-watch/8 p-6 sm:p-8">
              <p className="font-display text-2xl">We still need to know where.</p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Ranking is per city — the files are stored that way and loaded that way. Use Near me
                in the first question, or pick a city from the list.
              </p>
              {nearMeError ? (
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-critical">{nearMeError}</p>
              ) : null}
              <p className="mt-4">
                <Link
                  to="/atlas"
                  className="tap inline-flex rounded-full border border-border-strong px-4 py-2.5 text-xs text-muted-foreground hover:border-gilt hover:text-foreground"
                >
                  Or browse every city Deep Dish covers
                </Link>
              </p>
            </div>
          ) : regionLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8"
            >
              <p className="font-display text-2xl">
                Reading the {activeGroup} files&hellip;
              </p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                One file per restaurant, fetched for this city only. It is a few hundred kilobytes
                and it happens once — move between nights in the same city and nothing loads again.
              </p>
            </div>
          ) : regionError ? (
            <div
              role="status"
              className="rounded-2xl border border-critical/35 bg-critical-soft p-6 sm:p-8"
            >
              <p className="font-display text-2xl">The {activeGroup} file did not arrive.</p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {regionError} Nothing is ranked from a partial download — a list built on half a
                city would look complete and be wrong.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRegionAttempt((n) => n + 1)}
                  className="tap rounded-xl border border-border-strong px-4 py-2.5 text-sm hover:border-gilt"
                >
                  Try that city again
                </button>
                <Link
                  to="/atlas"
                  className="tap rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:border-gilt hover:text-foreground"
                >
                  Pick a different city
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/*
                A short list is not a bug to apologise for. Say the number, for
                the place the reader actually chose: the ranking loads a whole
                state and then filters to one city, so counting the loaded file
                would report 28 rooms in Oregon to somebody looking at one in
                Bend.

                Only for the shallow bands, though. The same sentence is already
                sitting under the "Where?" field, which stays on screen — and a
                reader looking at thirty cards does not need to be told the
                shelf is deep, because the cards are the evidence. Three cards
                and no sentence is the case that reads as breakage, so that is
                the case this one is kept for.
              */}
              {ranked.length > 0 && depthIsLean ? (
                <RegionDepth
                  className="mb-5"
                  region={situation.region}
                  group={activeGroup}
                  onWiden={situation.region ? () => patch({ region: null }) : undefined}
                />
              ) : null}
              {crossContactFocus ? null : (
                <div>
                  <p className="text-eyebrow text-gilt">Best fits</p>
                  <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                    What works for this night
                  </h2>
                </div>
              )}

              {ranked.length && crossContactFocus ? (
                <div className="mt-6">
                  <CrossContactView
                    ranked={ranked}
                    situation={situation}
                    details={details}
                    onOpen={setSelectedSlug}
                    regionLabel={situation.region ?? activeGroup ?? ""}
                    limit={limit}
                    onMore={() => setLimit((value) => value + 8)}
                  />
                </div>
              ) : ranked.length ? (
                <div className="mt-6 space-y-4">
                  {ranked.slice(0, limit).map((sc) => (
                    <DecisionCard
                      key={sc.record.slug}
                      sc={sc}
                      situation={situation}
                      details={details}
                      onOpen={() => setSelectedSlug(sc.record.slug)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8">
                  {emptyDiagnosis && emptyDiagnosis.inRegion === 0 ? (
                    <>
                      <p className="font-display text-2xl">
                        There are no files here yet, and that is the answer.
                      </p>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        Deep Dish holds nothing in {activeGroup}. Not a thin list — an empty one.
                        Cities are added by hand, from first-party pages, which is slow on purpose;
                        the queue is public.
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                          to="/atlas"
                          className="tap rounded-xl border border-border-strong px-4 py-2.5 text-sm hover:border-gilt"
                        >
                          Cities that are covered
                        </Link>
                        <Link
                          to="/console"
                          className="tap rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:border-gilt hover:text-foreground"
                        >
                          What is queued next
                        </Link>
                      </div>
                    </>
                  ) : emptyDiagnosis?.best ? (
                    <>
                      <p className="font-display text-2xl">Nothing clears what you asked for.</p>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        {activeGroup} holds{" "}
                        <span className="text-num">{emptyDiagnosis.inRegion}</span> files.{" "}
                        <span className="text-num">{emptyDiagnosis.best.count}</span> of them come
                        back the moment you lift {emptyDiagnosis.best.label} — so that is the thing
                        doing it, not the night you described.
                      </p>
                      <button
                        type="button"
                        onClick={() => patch(emptyDiagnosis.best!.patch)}
                        className="tap mt-5 rounded-xl border border-gilt bg-surface px-5 py-3 text-sm transition-colors hover:bg-surface-raised"
                      >
                        {emptyDiagnosis.best.action}
                      </button>
                      <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted-foreground">
                        What will not be lifted for you is the thing you said cannot go wrong. Deep
                        Dish does not quietly loosen a hard requirement to produce a recommendation,
                        because a recommendation you cannot use is worse than none.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-display text-2xl">Nothing clears what you asked for.</p>
                      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        {emptyDiagnosis
                          ? `All ${emptyDiagnosis.inRegion} files in ${activeGroup} were read and none of them survives every filter at once. Lifting any single one of them still leaves nothing.`
                          : "Nothing in this city survives every filter at once."}{" "}
                        Deep Dish will not quietly loosen a hard requirement to manufacture a
                        recommendation. Change only what is actually flexible.
                      </p>
                      <p className="mt-5">
                        <Link
                          to="/atlas"
                          className="tap inline-flex rounded-xl border border-border-strong px-4 py-2.5 text-sm hover:border-gilt"
                        >
                          Try a different city
                        </Link>
                      </p>
                    </>
                  )}
                </div>
              )}

              {!crossContactFocus && limit < ranked.length ? (
                <button
                  type="button"
                  onClick={() => setLimit((value) => value + 8)}
                  className="tap mt-6 w-full rounded-xl border border-border bg-surface py-3.5 text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  Show more options
                </button>
              ) : null}
            </>
          )}
        </section>

      </div>

      <section
        aria-labelledby="house-position"
        className="mt-16 border-y border-border-strong bg-surface-sunken"
      >
        <div aria-hidden className="h-px w-full bg-house-gold" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-eyebrow text-gilt">The house position</p>
          <h2
            id="house-position"
            className="display-statement mt-4 max-w-[16ch] text-foreground"
          >
            We stop rather than guess.
          </h2>
          <p className="mt-7 max-w-3xl text-[16px] leading-relaxed text-foreground sm:text-lg">
            Every file here starts at the restaurant&rsquo;s own pages. Where those pages say
            nothing, Deep Dish leaves the field empty and gives you the question to ask instead of
            a confident sentence somebody invented. Across{" "}
            <span className="text-num">{corpusMeta.count.toLocaleString()}</span> rooms the average
            record still has <span className="text-num">{corpusMeta.ops.avgUnknowns}</span> fields
            nobody has stated, and{" "}
            <span className="text-num">{corpusMeta.ops.officialConflicts}</span> of them hold two
            official sources that flatly contradict each other, both left standing rather than
            quietly reconciled. Stars, review sentiment and reputation move nothing here; a room
            only sinks when it has said, in its own words, that it cannot do the thing you told us
            cannot go wrong.
          </p>

          {/*
           * After the answer, one move — not a row of three that all look
           * equally like the thing to do next. Saved rooms mean the night is
           * already being assembled and the plan is the only place to finish
           * it; a ranked list with nothing saved means the move is to save one.
           */}
          {shortlist.slugs.length > 0 ? (
            <div className="mt-9">
              <Link
                to="/shortlist"
                className="tap inline-flex rounded-xl border border-gilt bg-surface px-5 py-3 text-sm text-foreground transition-colors hover:bg-surface-raised"
              >
                Finish the night plan — {shortlist.slugs.length} room
                {shortlist.slugs.length === 1 ? "" : "s"} on it
              </Link>
              <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Ordered by you, with each room&rsquo;s open questions carried across, ready to hand
                to Occasion OS when the table is booked.
              </p>
            </div>
          ) : started && ranked.length > 0 ? (
            <div className="mt-9">
              <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Save a room to the night plan from any card above. Two or three is the useful
                number — one to call, one for when the call goes badly.
              </p>
              <Link
                to="/guide"
                className="tap mt-4 inline-flex rounded-full border border-border-strong px-4 py-2.5 text-xs text-muted-foreground hover:border-gilt hover:text-foreground"
              >
                How Deep Dish thinks
              </Link>
            </div>
          ) : (
            <div className="mt-9 flex flex-wrap items-center gap-2">
              <Link
                to="/guide"
                className="tap rounded-full border border-border-strong px-4 py-2.5 text-xs text-muted-foreground hover:border-gilt hover:text-foreground"
              >
                How Deep Dish thinks
              </Link>
              <Link
                to="/atlas"
                className="tap rounded-full border border-border-strong px-4 py-2.5 text-xs text-muted-foreground hover:border-gilt hover:text-foreground"
              >
                What the corpus covers
              </Link>
            </div>
          )}
        </div>
      </section>

      <DecisionWorkflow
        sc={selected}
        situation={situation}
        details={details}
        onClose={() => setSelectedSlug(null)}
        onNextBest={nextBest}
      />
    </main>
  );
}
