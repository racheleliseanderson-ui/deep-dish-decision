import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { Reveal } from "@/components/rih/reveal";
import type { RestaurantRecord } from "@/lib/dataset";
import { emptySituation, scoreRecord, topOccasion } from "@/lib/intelligence";
import { useEnrichmentSignals } from "@/lib/prefs";
import { useShortlist } from "@/lib/shortlist";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useLiveRows, useMinuteClock } from "@/hooks/use-live-rows";
import { NightSummary } from "@/components/rih/night-summary";
import { ResultsMap } from "@/components/rih/results-map";
import {
  bookingRiskLine,
  formatDistance,
  haversineMi,
  openLabel,
  partyTotal,
  spendLine,
} from "@/lib/live";
import { decodeSituation } from "@/lib/situation-url";

export const Route = createFileRoute("/shortlist")({
  loader: () => import("@/lib/dataset"),
  head: () => ({
    meta: [
      { title: "Night Plan — your shortlisted restaurant records" },
      {
        name: "description",
        content:
          "Order your shortlisted restaurants into one night, see the combined confirmation burden, and take every unresolved line with you before you call.",
      },
      { property: "og:title", content: "Night Plan — one night, one confirmation pass" },
      {
        property: "og:description",
        content:
          "The shortlist becomes a plan: sequence, open unknowns, and the calls left to make.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Shortlist,
});

function Shortlist() {
  const { bySlug } = Route.useLoaderData();
  const { slugs, remove, clear, move } = useShortlist();
  const enrichment = useEnrichmentSignals();
  // A night plan reached from a shared situation link keeps that situation, so
  // party size and arrival time carry across instead of resetting to nothing.
  const search = useRouterState({ select: (st) => st.location.searchStr });
  const situation = search ? decodeSituation(search) : emptySituation;
  const now = useMinuteClock();

  const records = slugs.map((s) => bySlug.get(s)).filter((r): r is RestaurantRecord => Boolean(r));
  const { rows: live } = useLiveRows(records);

  const rows = records.map((r) => ({
    record: r,
    live: live[r.slug],
    sc: scoreRecord(r, situation, {
      useEnrichment: enrichment.enabled,
      live,
      now,
    }),
  }));

  /* How far each stop is from the one before it — the practical question when
     you are working a list in order. */
  const legs = rows.map((row, i) => {
    if (i === 0) return null;
    const a = rows[i - 1]?.live?.ll;
    const b = row.live?.ll;
    if (!a || !b) return null;
    const d = haversineMi(a, b);
    if (!Number.isFinite(d)) return null;
    const exact = rows[i - 1]?.live?.llSource === "exact" && row.live?.llSource === "exact";
    return { mi: d, exact };
  });

  const criticals = rows.reduce((a, r) => a + r.sc.criticals.length, 0);
  const unknowns = rows.reduce((a, r) => a + r.record.unknownsCount, 0);
  const calls = rows.filter((r) => r.record.hasPhone).length;
  const conflicts = rows.filter((r) => r.record.hasOfficialConflict).length;

  return (
    <main className="min-h-screen pb-28">
      <header className="grain-veil relative isolate overflow-hidden border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-8 sm:px-6">
          <h1 className="mt-10 max-w-3xl font-display text-[2.3rem] font-normal leading-[1.02] tracking-[-0.02em] sm:text-5xl">
            The night plan.
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Shortlisted rooms in the order you would work them. This list lives only in this browser
            — nothing is sent anywhere, and nothing here is a booking. What it does give you is one
            combined confirmation pass instead of four separate ones.
          </p>
          {rows.length ? (
            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Rooms on the plan" value={rows.length} />
              <Stat label="Critical lines" value={criticals} tone="critical" note="Read first" />
              <Stat label="Unknowns held open" value={unknowns} tone="unknown" />
              <Stat
                label="Reachable by phone"
                value={`${calls}/${rows.length}`}
                tone="verified"
                note={conflicts ? `${conflicts} with an official conflict` : "No open conflicts"}
              />
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {!rows.length ? (
          <div className="plate mt-12 p-8 text-center">
            <Eyebrow>Empty plan</Eyebrow>
            <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-muted-foreground">
              Nothing shortlisted yet. Add rooms from the instrument or from any record dossier, and
              they will collect here in the order you added them.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                to="/"
                className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
              >
                Open the instrument
              </Link>
              <Link
                to="/atlas"
                className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Browse the atlas
              </Link>
            </div>
          </div>
        ) : (
          <>
            <NightSummary
              stops={rows.map(({ record, live: lr }) => ({ record, live: lr }))}
              partySize={situation.partySize}
              arriveAt={situation.arriveAt}
              now={now}
            />

            {rows.filter((r) => r.live?.ll).length > 1 ? (
              <ResultsMap
                // On a night plan the number on the pin is the stop order, not
                // a rank — scoreRecord leaves rank at 0 because only rank() sets it.
                scored={rows.map((r, i) => ({ ...r.sc, rank: i + 1 }))}
                numberLabel="Stops in order"
                origin={situation.origin}
                originLabel={situation.originLabel}
                radiusMi={null}
              />
            ) : null}

            <ol className="mt-12 space-y-5">
              {rows.map(({ record, sc, live: liveRow }, i) => (
                <Reveal as="li" key={record.slug} delay={i * 40}>
                  {legs[i] ? (
                    <p className="mb-2 pl-1 text-[11px] uppercase tracking-[0.14em] text-subtle">
                      {formatDistance(legs[i]!.mi, legs[i]!.exact)} from stop {i}
                      {legs[i]!.exact ? "" : " · city-level estimate"}
                    </p>
                  ) : null}
                  <article className="plate p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-eyebrow">Stop {i + 1}</p>
                        <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight">
                          <Link
                            to="/record/$slug"
                            params={{ slug: record.slug }}
                            className="transition-colors hover:text-primary"
                          >
                            {record.title}
                          </Link>
                        </h2>
                        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                          {record.serviceSummary}
                        </p>
                      </div>
                      <div className="no-print flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => move(record.slug, -1)}
                          disabled={i === 0}
                          aria-label="Move earlier"
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(record.slug, 1)}
                          disabled={i === rows.length - 1}
                          aria-label="Move later"
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(record.slug)}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-critical/40 hover:text-critical"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* What you need at the moment of committing to this stop. */}
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-surface-sunken/40 px-4 py-3 sm:grid-cols-4">
                      {(() => {
                        // sc.open already resolves the reader's arrival moment;
                        // recomputing from the wall clock here would label a
                        // 7pm arrival with the state at the current hour.
                        const state = openLabel(sc.open, Boolean(situation.arriveAt));
                        const spend = spendLine(liveRow);
                        const total = partyTotal(liveRow, situation.partySize);
                        const risk = bookingRiskLine(liveRow);
                        const dish = liveRow?.dishes?.[0];
                        const cells: {
                          label: string;
                          value: string;
                          note?: string | undefined;
                          tone?: string | undefined;
                        }[] = [
                          {
                            label: situation.arriveAt ? "At your time" : "Right now",
                            value: state.text,
                            note: liveRow?.hours ? undefined : "no schedule on file",
                            tone: state.tone,
                          },
                          {
                            label: "Per guest",
                            value: spend ? spend.text.replace(/^About /, "") : "Not stated",
                            note: spend ? (total ?? spend.source) : "no figure on file",
                          },
                          {
                            label: "Known for",
                            value: dish ? dish.name : "No dish named",
                            note: dish
                              ? dish.source === "first-party"
                                ? "named by the restaurant"
                                : "recurring in reviews"
                              : undefined,
                          },
                          {
                            label: "If you cancel",
                            value: risk ?? "Nothing stated",
                            note: risk ? "not the price of dinner" : undefined,
                            tone: risk ? "watch" : undefined,
                          },
                        ];
                        return cells.map((c) => (
                          <div key={c.label} className="min-w-0">
                            <dt className="text-[10px] uppercase tracking-[0.14em] text-subtle">
                              {c.label}
                            </dt>
                            <dd
                              className={
                                "mt-0.5 truncate text-[13px] font-medium " +
                                (c.tone === "verified"
                                  ? "text-verified"
                                  : c.tone === "watch"
                                    ? "text-watch"
                                    : c.tone === "critical"
                                      ? "text-critical"
                                      : c.tone === "unknown"
                                        ? "text-subtle"
                                        : "text-foreground")
                              }
                              title={c.value}
                            >
                              {c.value}
                            </dd>
                            {c.note ? (
                              <p className="mt-0.5 truncate text-[11px] text-subtle">{c.note}</p>
                            ) : null}
                          </div>
                        ));
                      })()}
                    </dl>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <Chip tone="accent">{liveRow?.hood ?? record.region}</Chip>
                      <Chip>{topOccasion(record).occasion}</Chip>
                      <Chip>{record.depthLabel}</Chip>
                      {record.hasOfficialConflict ? (
                        <Chip tone="critical">Official conflict</Chip>
                      ) : null}
                      <Chip tone="unknown">{record.unknownsCount} unknowns</Chip>
                    </div>

                    <Rule className="my-5" />

                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <Eyebrow>Before you call</Eyebrow>
                        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
                          {(sc.criticals.length ? sc.criticals : sc.watch).slice(0, 3).map((f) => (
                            <li key={f.id} className="flex gap-2.5">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-critical" />
                              {f.action}
                            </li>
                          ))}
                          {!sc.criticals.length && !sc.watch.length ? (
                            <li className="text-verified">
                              Nothing critical on the record. Confirm the volatile lines anyway.
                            </li>
                          ) : null}
                        </ul>
                      </div>
                      <div>
                        <Eyebrow>Reach</Eyebrow>
                        <ul className="mt-3 space-y-2 text-[13px]">
                          <li className="text-num text-muted-foreground">
                            {record.hasPhone ? record.phone : "No published phone line"}
                          </li>
                          <li className="truncate text-muted-foreground">{record.address}</li>
                          <li>
                            <Link
                              to="/packet/$slug"
                              params={{ slug: record.slug }}
                              className="text-primary"
                            >
                              Open decision packet →
                            </Link>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </article>
                </Reveal>
              ))}
            </ol>

            <div className="no-print mt-10 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
              >
                Print the plan
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-critical/40 hover:text-critical"
              >
                Clear the plan
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
