import heroPass480 from "@/assets/hero-pass-480.webp";
import heroPass768 from "@/assets/hero-pass-768.webp";
import heroPass1200 from "@/assets/hero-pass-1200.webp";
import heroPass1800 from "@/assets/hero-pass-1800.webp";
import { DecisionCard, decisionState } from "@/components/rih/decision-card";
import { CrossContactView } from "@/components/rih/cross-contact-view";
import { DecisionWorkflow } from "@/components/rih/decision-workflow";
import { ImportedContext } from "@/components/rih/imported-context";
import { QuickStart } from "@/components/rih/quick-start";
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
import { emptyNightDetails, saveNightContext, type NightDetails } from "@/lib/night-context";
import { useOrigin } from "@/lib/origin";
import { loadRegionGroup } from "@/lib/region-load";
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
  const [regionRecords, setRegionRecords] = useState<RestaurantRecord[] | null>(null);
  const [liveRows, setLiveRows] = useState<Record<string, LiveRow> | null>(null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [nearMeResolving, setNearMeResolving] = useState(false);
  const [nearMeError, setNearMeError] = useState<string | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const appliedRef = useRef(false);
  const originState = useOrigin();

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
  }, [activeGroup]);

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
          {!started ? null : !regionReady ? (
            <div className="rounded-2xl border border-watch/35 bg-watch/8 p-6 sm:p-8">
              <p className="font-display text-2xl">We still need to know where.</p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Use Near me or choose a city in the first question.
              </p>
            </div>
          ) : regionLoading ? (
            <div className="rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8">
              <p className="font-display text-2xl">Finding the restaurants that could work for this night…</p>
            </div>
          ) : regionError ? (
            <div
              role="status"
              className="rounded-2xl border border-critical/35 bg-critical-soft p-6 sm:p-8"
            >
              <p className="font-display text-2xl">This region did not load.</p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {regionError}
              </p>
            </div>
          ) : (
            <>
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
                  <p className="font-display text-2xl">Nothing clears what you asked for.</p>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Deep Dish will not quietly loosen a hard requirement to manufacture a recommendation. Change only what is actually flexible.
                  </p>
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
              Browse restaurants
            </Link>
            <Link
              to="/shortlist"
              className="tap rounded-full border border-border-strong px-4 py-2.5 text-xs text-muted-foreground hover:border-gilt hover:text-foreground"
            >
              Night plan
            </Link>
          </div>
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
