import heroPass480 from "@/assets/hero-pass-480.webp";
import heroPass768 from "@/assets/hero-pass-768.webp";
import heroPass1200 from "@/assets/hero-pass-1200.webp";
import heroPass1800 from "@/assets/hero-pass-1800.webp";
import { DecisionCard } from "@/components/rih/decision-card";
import { DecisionWorkflow } from "@/components/rih/decision-workflow";
import { ImportedContext } from "@/components/rih/imported-context";
import { QuickStart } from "@/components/rih/quick-start";
import { RefineNight } from "@/components/rih/refine-night";
import { useSaltyImport } from "@/hooks/use-salty-import";
import { groupForRegion } from "@/lib/corpus-meta";
import type { RestaurantRecord } from "@/lib/dataset";
import {
  emptySituation,
  filterRecords,
  rank,
  type Situation,
} from "@/lib/intelligence";
import { loadLiveGroup, type LiveRow } from "@/lib/live";
import { findNearestRegionGroup } from "@/lib/nearest-region";
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
          "Tell Deep Dish where, what kind of night, when, and what cannot go wrong. Get a restaurant decision, the unknowns that matter, official sources, a confirmation path, and a booking handoff.",
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
          setNearMeError("Deep Dish could not match your location to a covered region. Choose a city instead.");
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
          setNearMeError("Deep Dish could not resolve nearby coverage. Choose a city instead.");
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
    Promise.all([loadRegionGroup(activeGroup), loadLiveGroup(activeGroup)])
      .then(([records, live]) => {
        if (cancelled) return;
        setRegionRecords(records);
        setLiveRows(live);
      })
      .finally(() => {
        if (!cancelled) setRegionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
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

  return (
    <main className="min-h-screen pb-28">
      <ImportedContext
        session={session}
        onApply={apply}
        onIgnore={ignore}
        applyLabel="Use this context"
      />

      <header className="relative isolate flex min-h-[58vh] items-end overflow-hidden border-b border-border-strong sm:min-h-[62vh]">
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

        <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 sm:pb-18 sm:pt-28">
          <p className="text-[11px] uppercase tracking-[0.18em] text-ink-foreground/65">
            Salty & Clever · Deep Dish
          </p>
          <h1 className="display-statement mt-4 max-w-[18ch] text-ink-foreground">
            Is this restaurant right for
            <span className="text-primary"> this particular night?</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-foreground/82 sm:text-lg">
            Find the fit. See what still needs verifying. Check the restaurant’s own source, make the call if you need to, then book with the loose ends closed.
          </p>
          <a
            href="#situation"
            className="tap mt-8 inline-flex min-h-11 items-center rounded-full bg-primary px-6 py-3 text-xs uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start with four questions
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        {dietNote ? (
          <p role="note" className="mb-6 rounded-xl border border-border bg-surface-raised/60 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
            {dietNote}
          </p>
        ) : null}

        <QuickStart
          situation={situation}
          onChange={(next) => {
            setSituation(next);
            setLimit(8);
          }}
          originState={originState}
          nearMeResolving={nearMeResolving}
          nearMeError={nearMeError}
          onSubmit={submit}
        />

        {started ? <RefineNight situation={situation} patch={patch} /> : null}

        <section id="ranked" className="mt-12 scroll-mt-24">
          {!started ? (
            <div className="rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8">
              <p className="font-display text-2xl">Deep Dish does not need your whole life story.</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Answer the four questions above. The deeper situation model stays underneath and only appears when you choose to refine the decision.
              </p>
            </div>
          ) : !regionReady ? (
            <div className="rounded-2xl border border-watch/35 bg-watch/8 p-6 sm:p-8">
              <p className="font-display text-2xl">We still need to know where.</p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Use Near me or choose a city in the first question. Deep Dish resolves the regional corpus internally; you never need to choose a “region group.”
              </p>
            </div>
          ) : regionLoading ? (
            <div className="rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8">
              <p className="font-display text-2xl">Reading the restaurants that could work for this night…</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-eyebrow text-gilt">Decision queue</p>
                  <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                    What works for this night
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    These are not directory rankings. Each restaurant is labeled by the decision you can make next: good fit, verify first, or hold.
                  </p>
                </div>
              </div>

              {ranked.length ? (
                <div className="mt-6 space-y-4">
                  {ranked.slice(0, limit).map((sc) => (
                    <DecisionCard
                      key={sc.record.slug}
                      sc={sc}
                      situation={situation}
                      onOpen={() => setSelectedSlug(sc.record.slug)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-border bg-surface-sunken/40 p-6 sm:p-8">
                  <p className="font-display text-2xl">Nothing clears the current filters.</p>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Deep Dish will not quietly loosen a hard constraint just to produce a recommendation. Open “Refine this night” and change only what is actually flexible.
                  </p>
                </div>
              )}

              {limit < ranked.length ? (
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

        <section className="mt-16 border-t border-border pt-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-eyebrow">Why Deep Dish is careful</p>
              <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight">The database is infrastructure. The decision is the product.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Deep Dish uses first-party restaurant evidence, keeps important unknowns open, and does not let star ratings override your actual night. If a stated hard constraint cannot be supported, the restaurant is held instead of quietly promoted.
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2 lg:justify-end">
              <Link to="/guide" className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">How Deep Dish thinks</Link>
              <Link to="/atlas" className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">Browse the Atlas</Link>
              <Link to="/shortlist" className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">Night plan</Link>
            </div>
          </div>
        </section>
      </div>

      <DecisionWorkflow sc={selected} situation={situation} onClose={() => setSelectedSlug(null)} />
    </main>
  );
}
