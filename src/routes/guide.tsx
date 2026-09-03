import { DecisionFlow } from "@/components/rih/decision-flow";
import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { GrowBar, Reveal } from "@/components/rih/reveal";
import { OCCASIONS, occasionScore, type Occasion } from "@/lib/intelligence";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/guide")({
  loader: async () => {
    // Was `import("@/lib/dataset")` alongside this — 5.4 MB, to score the
    // corpus in the browser and show five rows. The picks are precomputed now.
    return { atlas: await import("@/lib/atlas") };
  },
  head: () => ({
    meta: [
      { title: "How to Choose a Restaurant · Deep Dish" },
      {
        name: "description",
        content:
          "Occasion, commitment, spend, pathway, room. Five decisions settle a restaurant and a star rating settles none of them. One phone call closes the rest.",
      },
      { property: "og:title", content: "How to choose a restaurant, properly" },
      {
        property: "og:description",
        content:
          "Occasion, commitment, spend, pathway and room — the five decisions that settle a booking, with the confirmation call that closes the rest.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Guide,
});

const DECISIONS = [
  {
    n: "01",
    title: "Name the occasion before the cuisine",
    body: "Cuisine is the last filter, not the first. A room that is right for a negotiation dinner is wrong for a birthday of nine, whatever it cooks. Decide what the evening has to achieve, then let the kitchen be the tiebreak.",
    tell: "Ask yourself who must leave happy. If the answer is more than one kind of guest, the room matters more than the menu.",
  },
  {
    n: "02",
    title: "Price the commitment, not the plate",
    body: "The cost of a booking includes deposit, cancellation window, card hold, minimum spend and the length of the table. A moderate menu with a 48-hour cancellation and a two-hour turn is a heavier commitment than a dearer one you can leave.",
    tell: "Read the reservation terms before the prices. That is where the evening is actually priced.",
  },
  {
    n: "03",
    title: "Find the booking pathway early",
    body: "Pathway decides whether the plan survives. A walk-in-only room cannot be promised to guests flying in; a platform-only room cannot absorb a late addition. Match the pathway to how firm your party is.",
    tell: "If the party can still change size, you need a room with a phone that answers.",
  },
  {
    n: "04",
    title: "Read the room, not the rating",
    body: "Noise, pacing, formality and lighting decide whether a table can hold a conversation, a proposal or a toast. None of that is in a star average, and averages built from thousands of visits describe the mean night, never yours.",
    tell: "Pacing and noise language in a restaurant's own copy predicts your evening better than any score.",
  },
  {
    n: "05",
    title: "Treat silence as unknown, never as no",
    body: "A field a restaurant has not published is not a policy — it is an open question. Step-free access, dietary handling and private space are the three that most often go unstated and most often decide whether an evening works at all.",
    tell: "Take every unstated field into the call. Confirm it, then book.",
  },
] as const;

const CALL = [
  {
    q: "Access, in the specific terms you need",
    why: "Ask about the exact path: kerb to door, door to table, table to restroom. \u201cAccessible\u201d covers all three unevenly.",
  },
  {
    q: "How the kitchen handles the constraint",
    why: "Not whether they can, but how — substitution, separate preparation, or a dish removed. The difference decides the evening for the guest who has it.",
  },
  {
    q: "The real length of the table",
    why: "A turn time you learn on arrival has already reshaped the night. Ask for it in minutes.",
  },
  {
    q: "What cancellation actually costs, and when",
    why: "Window, amount, and whether a reduced party counts as a change. Get the number, not the reassurance.",
  },
] as const;

const PITFALLS = [
  [
    "Choosing on rating alone",
    "A high average tells you the mean night went well. It says nothing about noise, pacing, access or whether your party fits.",
  ],
  [
    "Assuming a website is current",
    "Menus and hours are the fastest-moving fields on any restaurant site. Treat anything undated as unverified.",
  ],
  [
    "Reading absence as reassurance",
    "No stated dress code is not casual. No stated deposit is not free cancellation.",
  ],
  [
    "Booking the room you liked last time",
    "The same room under a different service style — a tasting menu night, a private buyout — is a different evening entirely.",
  ],
] as const;

function Guide() {
  const { atlas } = Route.useLoaderData();
  const {
    byBookingPath,
    byPlanningLoad,
    bySpendBand,
    caseDepth,
    conflictRecords,
    corpus,
    gapMap,
    unreachableCount,
  } = atlas;
  const [occasion, setOccasion] = useState<Occasion>(OCCASIONS[0]);

  // Precomputed by scripts/build-atlas.ts using the same occasionScore this
  // page used to run over all 1,094 records on every occasion change.
  const picks = useMemo(
    () => (atlas.topPicksByOccasion[occasion] ?? []).map(({ score, ...r }) => ({ r, score })),
    [occasion, atlas],
  );

  const topGaps = gapMap.slice(0, 5);

  return (
    <main id="main" tabIndex={-1} className="min-h-dvh pb-28">
      <header className="grain-veil relative isolate overflow-hidden border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20">
          <p className="mt-10 text-eyebrow">The method</p>
          <h1 className="mt-4 max-w-4xl font-display text-[2.2rem] font-normal leading-[1.02] tracking-[-0.02em] sm:text-5xl lg:text-[4rem]">
            Five decisions settle a
            <br />
            <span className="text-primary">restaurant. Ratings settle none.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Choosing well is not taste, it is sequence. Occasion, commitment, pathway, room, and the
            honest handling of everything a restaurant has not said. This page is the method the
            instrument applies, written out — with the counts from our own corpus that show where
            the published evidence usually runs out.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label="Records under review"
              value={corpus.count}
              note={`${corpus.regions} regions`}
            />
            <Stat
              label="Core-field schema coverage"
              value={`${corpus.avgDepth}%`}
              note="Whether the 12 core slots hold text"
            />
            <Stat
              label="Case fields left unstated"
              value={`${caseDepth.avgUnstated} / ${caseDepth.totalFields}`}
              note={`${caseDepth.completeCaseFiles} complete case files`}
              tone="unknown"
            />
            <Stat
              label="Questions left open"
              value={corpus.totalUnknowns}
              note="Held open as unknown"
              tone="unknown"
            />
            <Stat
              label="Rooms with no phone"
              value={unreachableCount}
              note="Cannot be confirmed by call"
              tone="critical"
            />
          </div>

          <p className="mt-5 max-w-2xl text-[12px] leading-relaxed text-subtle">
            The two depth figures measure different things. Schema coverage counts whether each of
            the twelve core slots holds text; the case-field figure counts whether the restaurant
            published an answer, by the same test the record pages apply. A record can fill every
            slot and still state nothing.
          </p>

          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Where the line falls between what a restaurant said and what someone said about it is
            not a rule this instrument invented. It is written down, at length, in{" "}
            <a
              href="https://saltnotes.blog/research-and-standards/"
              className="underline decoration-border underline-offset-4 hover:text-foreground"
            >
              How We Judge Food, Drink and Restaurant Claims
            </a>
            . Read it if you want to argue with a verdict on this site.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* How the ordering actually works */}
        <Reveal as="section" className="mt-14">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
            <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">000</span>
            <h2 className="text-eyebrow">How a night becomes a shortlist</h2>
          </div>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Before the five decisions, the mechanism. Three things remove a room from your list, one
            thing reorders what is left, and a stated guest need can only hold a room when the room
            itself says it cannot meet it.
          </p>
          <DecisionFlow />
        </Reveal>

        {/* The five decisions */}
        <section className="mt-14">
          <ul className="grid gap-6 lg:grid-cols-2">
            {DECISIONS.map((d, i) => (
              <Reveal
                as="li"
                key={d.n}
                delay={i * 70}
                className={i === 0 ? "plate p-6 sm:p-9 lg:col-span-2 lg:p-12" : "plate p-6 sm:p-8"}
              >
                <div className="flex items-baseline gap-4">
                  <span className="text-num text-[13px] text-primary">{d.n}</span>
                  <h2
                    className={
                      i === 0
                        ? "font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl"
                        : "font-display text-2xl leading-tight tracking-tight sm:text-3xl"
                    }
                  >
                    {d.title}
                  </h2>
                </div>
                <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                  {d.body}
                </p>
                <p className="mt-4 border-l-2 border-primary/40 pl-4 text-[13px] leading-relaxed text-foreground">
                  {d.tell}
                </p>
              </Reveal>
            ))}
          </ul>
        </section>

        <Rule className="my-14" />

        {/* Occasion explorer */}
        <Reveal as="section">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Advice against evidence</Eyebrow>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                Pick an occasion. See what the corpus supports.
              </h2>
            </div>
            <p className="max-w-md text-[12px] leading-relaxed text-subtle">
              Ranking is computed from each record&apos;s own stated service, pacing, party and
              booking signals. A room that has published less ranks lower — that is the point.
            </p>
          </div>

          <div className="mt-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 scroll-slim">
            {OCCASIONS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOccasion(o)}
                aria-pressed={occasion === o}
                className={`tap shrink-0 rounded-full border px-4 text-[12px] transition-colors duration-300 ${
                  occasion === o
                    ? "border-primary/40 bg-primary/12 text-primary"
                    : "border-border bg-surface-raised text-subtle hover:text-foreground"
                }`}
              >
                {o}
              </button>
            ))}
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {picks.map((p, i) => (
              <li key={p.r.slug} className="plate flex flex-col p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-num text-[11px] text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-num text-[11px] text-subtle">{p.r.region}</span>
                </div>
                <Link
                  to="/record/$slug"
                  params={{ slug: p.r.slug }}
                  className="mt-3 font-display text-xl leading-tight tracking-tight text-foreground transition-colors hover:text-primary"
                >
                  {p.r.title}
                </Link>
                <p className="mt-1.5 text-[11px] text-subtle">
                  {p.r.city || p.r.regionGroup || p.r.region}
                </p>
                <GrowBar className="mt-4" value={p.score} tone="verified" />
                <p className="mt-2 text-[11px] text-subtle">
                  fit {Math.round(p.score)} · {p.r.unknownsCount} open questions
                </p>
                <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
                  {p.r.occasionFit || p.r.serviceSummary || "No published occasion language."}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Rule className="my-14" />

        {/* Commitment / pathway / spend evidence */}
        <Reveal as="section">
          <div className="grid gap-10 lg:grid-cols-3">
            {[
              {
                title: "Planning load",
                rows: byPlanningLoad,
                note: "How much work the booking itself will take.",
                tone: "watch" as const,
              },
              {
                title: "Booking pathway",
                rows: byBookingPath,
                note: "Whether the room can absorb a change of party.",
                tone: "primary" as const,
              },
              {
                title: "Spend band",
                rows: bySpendBand,
                note: "Published price language, not an estimate.",
                tone: "verified" as const,
              },
            ].map((block) => {
              const max = Math.max(...block.rows.map((r) => r.count), 1);
              return (
                <div key={block.title} className="min-w-0">
                  <Eyebrow>{block.title}</Eyebrow>
                  <p className="mt-2 text-[12px] leading-relaxed text-subtle">{block.note}</p>
                  <ul className="mt-4 divide-y divide-border">
                    {block.rows.slice(0, 8).map((r) => (
                      <li key={r.label} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13px] text-foreground">{r.label}</span>
                          <span className="text-num shrink-0 text-[13px] text-muted-foreground">
                            {r.count}
                            <span className="text-subtle"> · {r.share}%</span>
                          </span>
                        </div>
                        <GrowBar className="mt-2" value={(r.count / max) * 100} tone={block.tone} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* The call */}
        <Reveal as="section">
          <div className="plate overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="bg-surface-sunken p-6 sm:p-9">
                <Eyebrow>The call</Eyebrow>
                <h2 className="mt-3 font-display text-3xl leading-[1.05] tracking-tight sm:text-4xl">
                  Four questions close
                  <br />
                  <span className="text-primary">almost every gap.</span>
                </h2>
                <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
                  One call, under four minutes, in this order. Confirm before you book, not after.
                  {conflictRecords.length
                    ? ` ${conflictRecords.length} record${conflictRecords.length === 1 ? "" : "s"} in the corpus carry an unresolved conflict between official sources — for those, the call is the only tiebreak.`
                    : ""}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Chip tone="unknown">{corpus.totalUnknowns} open questions corpus-wide</Chip>
                  <Chip tone="critical">{unreachableCount} rooms unreachable</Chip>
                </div>
              </div>
              <ol className="divide-y divide-border">
                {CALL.map((c, i) => (
                  <li key={c.q} className="p-6 sm:p-8">
                    <div className="flex items-baseline gap-3">
                      <span className="text-num text-[12px] text-primary">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-[15px] font-medium text-foreground">{c.q}</h3>
                    </div>
                    <p className="mt-2 pl-8 text-[13px] leading-relaxed text-muted-foreground">
                      {c.why}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* Gaps + pitfalls */}
        <Reveal as="section">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <Eyebrow>What restaurants leave unsaid most often</Eyebrow>
              <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                Counted across the corpus. Expect to close these on the phone every time.
              </p>
              <ul className="mt-4 space-y-4">
                {topGaps.map((g) => (
                  <li key={g.field}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] text-foreground">{g.field}</span>
                      <span className="text-num shrink-0 text-[13px] text-unknown">
                        {g.missing}
                        <span className="text-subtle"> / {corpus.count}</span>
                      </span>
                    </div>
                    <GrowBar className="mt-2" value={g.share} tone="unknown" />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow>Four ways a good choice goes wrong</Eyebrow>
              <ul className="mt-4 divide-y divide-border">
                {PITFALLS.map(([title, body]) => (
                  <li key={title} className="py-4">
                    <h3 className="text-[14px] font-medium text-foreground">{title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/"
                  className="tap inline-flex items-center rounded-full bg-primary px-5 text-[12px] uppercase tracking-[0.14em] text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Run the instrument
                </Link>
                <Link
                  to="/atlas"
                  className="tap inline-flex items-center rounded-full border border-border px-5 text-[12px] uppercase tracking-[0.14em] text-foreground transition-colors hover:border-border-strong"
                >
                  See the corpus atlas
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
