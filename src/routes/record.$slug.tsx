import { Chip, Eyebrow, Rule } from "@/components/rih/bits";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { LayerStack } from "@/components/rih/findings";
import { Reveal } from "@/components/rih/reveal";
import { SiteNav } from "@/components/rih/site-nav";
import { bySlug } from "@/lib/dataset";
import { emptySituation, scoreRecord, topOccasion } from "@/lib/intelligence";
import { useShortlist } from "@/lib/shortlist";
import { decodeSituation, encodeSituation } from "@/lib/situation-url";
import { cn } from "@/lib/utils";
import { createFileRoute, Link, notFound, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/record/$slug")({
  loader: ({ params }) => {
    const record = bySlug.get(params.slug);
    if (!record) throw notFound();
    return { record };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Record unavailable" }, { name: "robots", content: "noindex" }],
      };
    }
    const r = loaderData.record;
    const title = `${r.title} — first-party record · ${r.region}`;
    const description = `${r.serviceSummary.slice(0, 150)}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: RecordNotFound,
  component: Dossier,
});

function RecordNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-24 text-center">
      <h1 className="font-display text-4xl tracking-tight">No such record</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing in the corpus carries that identifier. Records are only created where first-party
        evidence exists.
      </p>
      <Link to="/" className="mt-6 inline-block text-sm text-primary">
        Back to the instrument
      </Link>
    </main>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  const thin = !value || /^not stated/i.test(value);
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[190px_1fr] sm:gap-6">
      <dt className="text-eyebrow pt-0.5">{label}</dt>
      <dd
        className={cn(
          "text-[13px] leading-relaxed",
          thin ? "text-unknown" : "text-muted-foreground",
        )}
      >
        {thin ? "Not stated — held open" : value}
      </dd>
    </div>
  );
}

function Dossier() {
  const { record } = Route.useLoaderData();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const situation = search ? decodeSituation(search) : emptySituation;
  const sc = scoreRecord(record, situation);
  const shortlist = useShortlist();
  const q = encodeSituation(situation);
  const strongest = topOccasion(record);

  return (
    <main className="min-h-screen pb-28">
      <header className="grain-veil relative isolate overflow-hidden border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6">
          <SiteNav />
          <p className="text-eyebrow mt-10">{record.recordId}</p>
          <h1 className="mt-3 max-w-4xl font-display text-[2.3rem] font-normal leading-[1.02] tracking-[-0.02em] sm:text-5xl">
            {record.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {record.cuisineContext}
          </p>
          <div className="mt-6 flex flex-wrap gap-1.5">
            <Chip tone="accent">{record.region}</Chip>
            <Chip>{record.depthLabel}</Chip>
            <Chip tone="unknown">{record.unknownsCount} unknowns held open</Chip>
            {record.hasOfficialConflict ? <Chip tone="critical">Official conflict</Chip> : null}
            <Chip tone={record.reviewStatus === "overdue" ? "critical" : "verified"}>
              Reviewed {record.reviewedAt} · next {record.nextReviewAt}
            </Chip>
            <Chip>Strongest recorded use: {strongest.occasion}</Chip>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Link
              to="/packet/$slug"
              params={{ slug: record.slug }}
              search={q ? (Object.fromEntries(new URLSearchParams(q)) as never) : undefined}
              className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
            >
              Open decision packet
            </Link>
            <button
              type="button"
              onClick={() => shortlist.toggle(record.slug)}
              className={cn(
                "rounded-full border px-4 py-2 text-xs transition-colors",
                shortlist.has(record.slug)
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {shortlist.has(record.slug) ? "On the night plan" : "Add to night plan"}
            </button>
            {record.reservationUrl || record.website ? (
              <a
                href={record.reservationUrl || record.website}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                Booking pathway ({record.bookingPlatforms[0] ?? "direct"})
              </a>
            ) : null}
            {record.hasPhone ? (
              <a
                href={`tel:${record.phone.replace(/[^\d+]/g, "")}`}
                className="text-num rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                {record.phone}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal as="section" className="mt-10">
          <DecisionBrief sc={sc} situation={situation} />
        </Reveal>

        <Reveal as="section" className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-8">
            <LayerStack title="Critical" findings={sc.criticals} layer="critical" />
            <LayerStack title="Watch" findings={sc.watch} layer="watch" />
            <LayerStack title="Unknown — held open" findings={sc.unknowns} layer="unknown" />
          </div>
          <div className="plate p-5 sm:p-6">
            <Eyebrow>Confirmation pass</Eyebrow>
            <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
              {record.checklist.map((c) => (
                <li key={c} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {c}
                </li>
              ))}
            </ul>
            <Rule className="my-6" />
            <Eyebrow>Sources of record</Eyebrow>
            <ul className="mt-3 space-y-2 text-[12px]">
              {record.sources.map((s) => (
                <li key={s} className="truncate">
                  <a
                    href={s}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] leading-relaxed text-subtle">{record.disclaimer}</p>
          </div>
        </Reveal>

        <Rule className="my-14" />

        <Reveal as="section">
          <Eyebrow>Full evidence log</Eyebrow>
          <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight">
            Every line, as the restaurant states it.
          </h2>
          <dl className="mt-6 divide-y divide-border">
            <EvidenceRow label="Service" value={record.serviceSummary} />
            <EvidenceRow label="Menu" value={record.menuSummary} />
            <EvidenceRow label="Occasion fit" value={record.occasionFit} />
            <EvidenceRow label="Hours" value={record.hoursSummary} />
            <EvidenceRow label="Reservations" value={record.reservationDetails} />
            <EvidenceRow label="Price" value={record.priceDetails} />
            <EvidenceRow label="Dietary" value={record.dietaryDetails} />
            <EvidenceRow label="Beverage" value={record.beverageDetails} />
            <EvidenceRow label="Groups & private" value={record.groupDetails} />
            <EvidenceRow label="Atmosphere" value={record.atmosphereSummary} />
            <EvidenceRow label="Accessibility" value={record.accessibilityState} />
            <EvidenceRow label="Parking & transit" value={record.parkingTransit} />
            <EvidenceRow label="Dress" value={record.dressCode} />
            <EvidenceRow label="Typical meal length" value={record.typicalMealLength} />
            <EvidenceRow label="Practical notes" value={record.practicalNotes} />
            <EvidenceRow label="Address" value={record.address} />
            <EvidenceRow label="Open unknowns" value={record.unknowns} />
            <EvidenceRow label="Conflict" value={record.conflict} />
            <EvidenceRow label="Source authority" value={record.sourceAuthority} />
            <EvidenceRow label="Confidence" value={record.confidence} />
            <EvidenceRow label="Freshness" value={record.freshnessStatus} />
            <EvidenceRow label="Field volatility" value={record.fieldVolatility} />
            <EvidenceRow label="Next action" value={record.nextAction} />
          </dl>
        </Reveal>
      </div>
    </main>
  );
}
