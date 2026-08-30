import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { Reveal } from "@/components/rih/reveal";
import { bySlug, type RestaurantRecord } from "@/lib/dataset";
import { emptySituation, scoreRecord, topOccasion } from "@/lib/intelligence";
import { useEnrichmentSignals } from "@/lib/prefs";
import { useShortlist } from "@/lib/shortlist";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/shortlist")({
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
  const { slugs, remove, clear, move } = useShortlist();
  const enrichment = useEnrichmentSignals();
  const rows = slugs
    .map((s) => bySlug.get(s))
    .filter((r): r is RestaurantRecord => Boolean(r))
    .map((r) => ({
      record: r,
      sc: scoreRecord(r, emptySituation, { useEnrichment: enrichment.enabled }),
    }));

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
            Shortlisted rooms in the order you would work them. This list lives only in this
            browser — nothing is sent anywhere, and nothing here is a booking. What it does give you
            is one combined confirmation pass instead of four separate ones.
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
            <ol className="mt-12 space-y-5">
              {rows.map(({ record, sc }, i) => (
                <Reveal as="li" key={record.slug} delay={i * 40}>
                  <article className="plate p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-eyebrow">
                          Stop {i + 1}
                        </p>
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

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <Chip tone="accent">{record.region}</Chip>
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
                          {(sc.criticals.length ? sc.criticals : sc.watch)
                            .slice(0, 3)
                            .map((f) => (
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
