import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { GrowBar, Reveal } from "@/components/rih/reveal";
import { createFileRoute, Link } from "@tanstack/react-router";

type Facet = {
  label: string;
  count: number;
  share: number;
  thin: number;
  conflicts: number;
  avgUnknowns: number;
  reachable: number;
};

export const Route = createFileRoute("/atlas")({
  loader: () => import("@/lib/atlas"),
  head: () => ({
    meta: [
      { title: "Corpus Atlas · Deep Dish" },
      {
        name: "description",
        content:
          "Every dimension of the first-party restaurant corpus: geography, cuisine, booking pathway, spend band, evidence depth, open conflicts and the fields that stay unstated.",
      },
      { property: "og:title", content: "Corpus Atlas — what the evidence covers" },
      {
        property: "og:description",
        content:
          "Coverage, depth and gaps across every record under review — counted from first-party evidence, never inferred.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Atlas,
});

function FacetTable({
  title,
  note,
  rows,
  limit = 10,
  tone = "primary",
}: {
  title: string;
  note?: string;
  rows: Facet[];
  limit?: number;
  tone?: "primary" | "unknown" | "verified" | "watch";
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow as="h2">{title}</Eyebrow>
        <span className="text-num text-[11px] text-subtle">{rows.length} values</span>
      </div>
      {note ? <p className="mt-2 text-[12px] leading-relaxed text-subtle">{note}</p> : null}
      <ul className="mt-4 divide-y divide-border">
        {rows.slice(0, limit).map((r) => (
          <li key={r.label} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-foreground">{r.label}</span>
              <span className="text-num shrink-0 text-[13px] text-muted-foreground">
                {r.count}
                <span className="text-subtle"> · {r.share}%</span>
              </span>
            </div>
            <GrowBar className="mt-2" value={(r.count / max) * 100} tone={tone} />
            <p className="mt-1.5 text-[11px] text-subtle">
              {r.avgUnknowns} avg unknowns · {r.thin} thin · {r.conflicts} conflicted ·{" "}
              {r.reachable}/{r.count} reachable by phone
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordStrip({
  title,
  note,
  rows,
  tone,
}: {
  title: string;
  note: string;
  rows: { slug: string; title: string; recordId: string; region: string; detail: string }[];
  tone: "critical" | "watch" | "unknown" | "verified";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow as="h2">{title}</Eyebrow>
        <Chip tone={tone}>{rows.length}</Chip>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-subtle">{note}</p>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.slug} className="py-2.5">
            <Link
              to="/record/$slug"
              params={{ slug: r.slug }}
              className="group flex flex-wrap items-baseline justify-between gap-2"
            >
              <span className="text-[13px] text-foreground transition-colors group-hover:text-primary">
                {r.title}
              </span>
              <span className="text-num text-[11px] text-subtle">{r.region}</span>
            </Link>
            <p className="mt-0.5 text-[11px] text-subtle">
              {r.region} · {r.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Atlas() {
  const {
    byAccessibility,
    byBookingPath,
    byCuisine,
    byDaypart,
    byDietary,
    byPlanningLoad,
    byRegionGroup,
    byServiceStyle,
    bySpendBand,
    byStateProvince,
    byStrongestOccasion,
    caseDepth,
    conflictRecords,
    corpus,
    densestMetros,
    depthLeaders,
    dueSoonRecords,
    gapMap,
    overdueRecords,
    thinnest,
    thinnestMetros,
    unreachableCount,
  } = Route.useLoaderData();
  return (
    <main className="min-h-screen pb-28">
      <header className="grain-veil relative isolate overflow-hidden border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20">
          <h1 className="mt-10 max-w-4xl font-display text-[2.4rem] font-normal leading-[1] tracking-[-0.02em] sm:text-5xl lg:text-[4rem]">
            The atlas of what we
            <br />
            <span className="text-primary">actually know.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Coverage is not quality and quantity is not confidence. This page counts the corpus
            against itself — where the evidence is dense, where it thins out, which fields go
            unstated most often, and which records are carrying an unresolved conflict. Every number
            below is counted from recorded fields. Nothing is modelled or estimated.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Records" value={corpus.count} note={`${corpus.regions} regions`} />
            <Stat
              label="Core-field schema coverage"
              value={`${corpus.avgDepth}%`}
              note={`${corpus.fullCaseFiles} records fill all 12 slots`}
            />
            <Stat
              label="Case fields left unstated"
              value={`${caseDepth.avgUnstated} / ${caseDepth.totalFields}`}
              note={`${caseDepth.completeCaseFiles} complete case files`}
              tone="unknown"
            />
            <Stat
              label="Unknowns held open"
              value={corpus.totalUnknowns}
              note={`${corpus.totalThin} thin fields across the corpus`}
              tone="unknown"
            />
            <Stat
              label="Open official conflicts"
              value={corpus.conflicts}
              note="Both sources preserved"
              tone="critical"
            />
          </div>

          <p className="mt-5 max-w-2xl text-[12px] leading-relaxed text-subtle">
            Those two middle figures read the same corpus and disagree on purpose. Schema coverage
            counts whether each of the twelve core slots holds text; the case-field figure counts
            whether the restaurant published an answer, using the same test the record pages use. A
            record can fill every slot and still say nothing, which is why both are printed here.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Gap map — the honest headline */}
        <Reveal as="section" className="mt-12">
          <div className="plate p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow as="h2">Gap map</Eyebrow>
                <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                  The fields the restaurants have not stated.
                </h2>
              </div>
              <p className="max-w-md text-[12px] leading-relaxed text-subtle">
                Read this before any coverage chart. A field missing here means the restaurant has
                not published it — not that it does not exist. These are the lines a call has to
                close.
              </p>
            </div>
            <ul className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              {gapMap.map((g) => (
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
        </Reveal>

        {/* Geography */}
        <Reveal as="section" className="mt-14">
          <div className="grid gap-10 lg:grid-cols-2">
            <FacetTable
              title="Region groups"
              note="Coverage is uneven by design — records enter the corpus when first-party evidence exists, not to fill a map."
              rows={byRegionGroup}
              limit={12}
            />
            <FacetTable
              title="States & provinces"
              note="Thin counts here show where a second pass would pay off most."
              rows={byStateProvince}
              limit={12}
              tone="watch"
            />
          </div>
        </Reveal>

        <Reveal as="section" className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow as="h2">Metro density</Eyebrow>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                Covered is not the same as useful.
              </h2>
            </div>
            <p className="max-w-md text-[12px] leading-relaxed text-subtle">
              State-floor coverage can read as complete while a large metro still has too few
              records to plan a night. Density is counted from named cities on the record.
            </p>
          </div>
          <div className="mt-8 grid gap-10 lg:grid-cols-2">
            <FacetTable
              title="Thinnest metros"
              note="Fewest records. These are the first density-batch targets."
              rows={thinnestMetros}
              limit={12}
              tone="unknown"
            />
            <FacetTable
              title="Densest metros"
              note="Where the instrument can actually compare rooms."
              rows={densestMetros}
              limit={12}
              tone="verified"
            />
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* Character */}
        <Reveal as="section">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow as="h2">Character of the corpus</Eyebrow>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                What these rooms are for.
              </h2>
            </div>
            <p className="max-w-md text-[12px] leading-relaxed text-subtle">
              Strongest occasion is derived from each record&apos;s own stated service, pacing and
              format signals — not from anyone&apos;s opinion of the room.
            </p>
          </div>
          <div className="mt-8 grid gap-10 lg:grid-cols-3">
            <FacetTable title="Strongest recorded occasion" rows={byStrongestOccasion} limit={14} />
            <FacetTable title="Cuisine & style" rows={byCuisine} limit={14} tone="verified" />
            <FacetTable title="Service style" rows={byServiceStyle} limit={14} tone="watch" />
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* Planning */}
        <Reveal as="section">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="grid gap-10 sm:grid-cols-2">
              <FacetTable title="Booking pathway" rows={byBookingPath} limit={8} />
              <FacetTable title="Spend band" rows={bySpendBand} limit={8} tone="watch" />
              <FacetTable title="Planning load" rows={byPlanningLoad} limit={6} />
              <FacetTable title="Daypart" rows={byDaypart} limit={8} tone="verified" />
            </div>
            <div className="grid gap-10 sm:grid-cols-2">
              <FacetTable
                title="Accessibility recorded"
                note="Unrecorded access is never treated as available."
                rows={byAccessibility}
                limit={8}
                tone="unknown"
              />
              <FacetTable
                title="Dietary handling recorded"
                note="A named policy is evidence. Silence is not a yes."
                rows={byDietary}
                limit={8}
                tone="unknown"
              />
            </div>
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* Condition */}
        <Reveal as="section">
          <Eyebrow as="h2">Corpus condition</Eyebrow>
          <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
            Records that need a human before they need a reader.
          </h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-2 xl:grid-cols-4">
            <RecordStrip
              title="Open official conflicts"
              note="Two first-party sources disagree. Both stay on the record."
              tone="critical"
              rows={conflictRecords.map((r) => ({
                slug: r.slug,
                title: r.title,
                recordId: r.recordId,
                region: r.region,
                detail: r.conflict || "conflict recorded",
              }))}
            />
            <RecordStrip
              title="Review overdue or due soon"
              note="Volatile fields decay fastest: hours, price, reservation policy."
              tone="watch"
              rows={[...overdueRecords, ...dueSoonRecords].slice(0, 10).map((r) => ({
                slug: r.slug,
                title: r.title,
                recordId: r.recordId,
                region: r.region,
                detail: `reviewed ${r.reviewedAt} · next ${r.nextReviewAt}`,
              }))}
            />
            <RecordStrip
              title="Thinnest records"
              note="Usable, but they will carry more confirm burden than the rest."
              tone="unknown"
              rows={thinnest.map((r) => ({
                slug: r.slug,
                title: r.title,
                recordId: r.recordId,
                region: r.region,
                detail: `${r.thinFieldCount} thin · ${r.unknownsCount} unknowns`,
              }))}
            />
            <RecordStrip
              title="Deepest case files"
              note="Most complete on the record. Still confirm the volatile lines."
              tone="verified"
              rows={depthLeaders.map((r) => ({
                slug: r.slug,
                title: r.title,
                recordId: r.recordId,
                region: r.region,
                detail: r.depthLabel,
              }))}
            />
          </div>

          <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            {unreachableCount} record{unreachableCount === 1 ? " has" : "s have"} no published
            phone line, which means the confirmation pass has to run through the booking platform or
            an email thread. Corpus generated {corpus.generatedAt}; source sync {corpus.sourceSync}.
          </p>
        </Reveal>
      </div>
    </main>
  );
}
