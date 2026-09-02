import { Chip, Eyebrow } from "@/components/rih/bits";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { DinerQuestions } from "@/components/rih/diner-questions";
import { FindingsStack } from "@/components/rih/findings";
import { ReputationPanel } from "@/components/rih/reputation-panel";
import { Reveal } from "@/components/rih/reveal";
import { fieldDisplay, isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import { emptySituation, scoreRecord, topOccasion } from "@/lib/intelligence";
import { useShortlist } from "@/lib/shortlist";
import { enrichmentAudit } from "@/lib/enrichment";
import { useEnrichmentGroup } from "@/hooks/use-enrichment";
import { decodeSituation, encodeSituation } from "@/lib/situation-url";
import { cn } from "@/lib/utils";
import { createFileRoute, Link, notFound, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadLiveGroup, type LiveRow } from "@/lib/live";
import { TableIntelligence, TableIntelligenceHeading } from "@/components/rih/table-intelligence";
import { WhyThisRank } from "@/components/rih/why-this-rank";
import { saveNightContext } from "@/lib/night-context";

export const Route = createFileRoute("/record/$slug")({
  loader: async ({ params }): Promise<{ record: RestaurantRecord }> => {
    const { loadRecordBySlug } = await import("@/lib/region-load");
    const record = await loadRecordBySlug(params.slug);
    if (!record) throw notFound();
    return { record };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Restaurant unavailable" }, { name: "robots", content: "noindex" }],
      };
    }
    const r = loaderData.record;
    const title = `${r.title} — Deep Dish restaurant research · ${r.region}`;
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
  notFoundComponent: RestaurantNotFound,
  component: Dossier,
});

function RestaurantNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-24 text-center">
      <h1 className="font-display text-4xl tracking-tight">Restaurant not found</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Deep Dish does not have a current research page for that restaurant.
      </p>
      <Link to="/" className="mt-6 inline-block text-sm text-primary">
        Back to Deep Dish
      </Link>
    </main>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  const display = fieldDisplay(value);
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[190px_1fr] sm:gap-6">
      <dt className="text-eyebrow pt-0.5">{label}</dt>
      <dd
        className={cn(
          "text-[13px] leading-relaxed",
          display.unstated ? "text-unknown" : "text-muted-foreground",
        )}
      >
        {display.text}
      </dd>
    </div>
  );
}

function Dossier() {
  const { record } = Route.useLoaderData();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const situation = search ? decodeSituation(search) : emptySituation;
  const [live, setLive] = useState<LiveRow | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    loadLiveGroup(record.regionGroup || record.region)
      .then((rows) => {
        if (!cancelled) setLive(rows[record.slug]);
      })
      .catch((error: unknown) => {
        // The live layer is an overlay on a record that already renders; log it
        // and leave `live` undefined rather than failing the page.
        console.error(`Live layer for "${record.slug}" failed to load`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [record.regionGroup, record.region, record.slug]);

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

  const sc = scoreRecord(record, situation, {
    ...(live ? { live: { [record.slug]: live } } : {}),
    now,
  });
  const shortlist = useShortlist();
  const enrichmentReady = useEnrichmentGroup(record.regionGroup);
  const audit = enrichmentReady
    ? enrichmentAudit(record.slug)
    : { present: false as const, completeness: null, fields: [] };
  const q = encodeSituation(situation);
  const strongest = topOccasion(record);

  return (
    <main className="min-h-screen pb-28">
      <header className="grain-veil relative isolate overflow-hidden border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6">
          <p className="text-eyebrow mt-10">{record.region}</p>
          <h1 className="mt-3 max-w-4xl font-display text-[2.3rem] font-normal leading-[1.02] tracking-[-0.02em] sm:text-5xl">
            {record.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {isUnstated(record.cuisineContext)
              ? [
                  record.region,
                  record.serviceSummary && !isUnstated(record.serviceSummary)
                    ? record.serviceSummary
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Restaurant research — details the restaurant does not publish remain open."
              : record.cuisineContext}
          </p>
          <div className="mt-6 flex flex-wrap gap-1.5">
            <Chip tone="accent">{record.region}</Chip>
            {record.hasOfficialConflict ? <Chip tone="critical">Conflicting official information</Chip> : null}
            <Chip>Updated {record.reviewedAt}</Chip>
            <Chip>Best recorded use: {strongest.occasion}</Chip>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Link
              to="/packet/$slug"
              params={{ slug: record.slug }}
              search={(q ? Object.fromEntries(new URLSearchParams(q)) : {}) as never}
              className="tap inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
            >
              Open decision details
            </Link>
            <button
              type="button"
              onClick={() => {
                saveNightContext(situation);
                shortlist.toggle(record.slug);
              }}
              aria-pressed={shortlist.has(record.slug)}
              className={cn(
                "tap inline-flex items-center rounded-full border px-4 py-2 text-xs transition-colors",
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
                className="tap inline-flex items-center rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                Book / reserve
              </a>
            ) : null}
            {record.hasPhone ? (
              <a
                href={`tel:${record.phone.replace(/[^\d+]/g, "")}`}
                className="tap text-num inline-flex items-center rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"
              >
                {record.phone}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal as="section" className="mt-10">
          <DinerQuestions record={record} />
        </Reveal>

        <Reveal as="section" className="mt-12">
          <TableIntelligenceHeading />
          <div className="mt-5">
            <TableIntelligence
              record={record}
              live={live}
              partySize={situation.partySize}
              now={now}
            />
          </div>
        </Reveal>

        <Reveal as="section" className="mt-10">
          <ReputationPanel slug={record.slug} />
        </Reveal>

        <Reveal as="section" className="mt-10">
          <DecisionBrief sc={sc} situation={situation} />
        </Reveal>

        <Reveal as="section" className="mt-10">
          <WhyThisRank sc={sc} />
        </Reveal>

        <Reveal as="section" className="mt-12">
          <Eyebrow>What Deep Dish is watching</Eyebrow>
          <h2 className="mt-2 font-display text-2xl tracking-tight">For this night</h2>
          <div className="mt-5">
            <FindingsStack findings={sc.findings} />
          </div>
        </Reveal>

        <Reveal as="section" className="mt-12 pb-16">
          <Eyebrow>Restaurant sources</Eyebrow>
          <h2 className="mt-2 font-display text-2xl tracking-tight">What the restaurant publishes</h2>
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
            <EvidenceRow label="Still unstated" value={record.unknowns} />
            <EvidenceRow label="Conflicting information" value={record.conflict} />
            <EvidenceRow label="Source quality" value={record.sourceAuthority} />
            <EvidenceRow label="Confidence" value={record.confidence} />
            <EvidenceRow label="Freshness" value={record.freshnessStatus} />
            <EvidenceRow label="Likely to change" value={record.fieldVolatility} />
            <EvidenceRow label="What to verify next" value={record.nextAction} />
          </dl>
        </Reveal>
      </div>
    </main>
  );
}
