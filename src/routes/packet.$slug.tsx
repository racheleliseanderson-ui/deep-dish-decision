import { Eyebrow } from "@/components/rih/bits";
import { ThemeToggle } from "@/components/rih/theme-toggle";
import type { RestaurantRecord } from "@/lib/dataset";
import { decisionBrief, scoreRecord, situationDepth, SITUATION_SLOTS } from "@/lib/intelligence";
import { downloadPacketPdf } from "@/lib/packet-pdf";
import { decodeSituation } from "@/lib/situation-url";
import { useEffect, useState } from "react";
import {
  bookingRiskLine,
  loadLiveGroup,
  minutesToClock,
  partyTotal,
  spendLine,
  type LiveRow,
} from "@/lib/live";
import { createFileRoute, Link, notFound, useRouterState } from "@tanstack/react-router";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbs } from "@/lib/seo/jsonld";
import { packetDescription, packetTitle } from "@/lib/seo/record-meta";

export const Route = createFileRoute("/packet/$slug")({
  loader: async ({ params }): Promise<{ record: RestaurantRecord }> => {
    const { loadRecordBySlug } = await import("@/lib/region-load");
    const record = await loadRecordBySlug(params.slug);
    if (!record) throw notFound();
    return { record };
  },
  head: ({ loaderData }) => {
    // One shared title went out on every packet in the corpus, so ~1,500 pages
    // announced themselves to search as the same document.
    if (!loaderData) {
      return {
        meta: [{ title: "Booking packet · Deep Dish" }, { name: "robots", content: "noindex" }],
      };
    }
    const r = loaderData.record;
    const title = packetTitle(r);
    const description = packetDescription(r);
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
  component: Packet,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-border pt-5">
      <Eyebrow as="h2">{title}</Eyebrow>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Packet() {
  const { record } = Route.useLoaderData();

  const [live, setLive] = useState<LiveRow | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadLiveGroup(record.regionGroup || record.region)
      .then((rows) => {
        if (!cancelled) setLive(rows[record.slug]);
      })
      .catch((error: unknown) => {
        console.error(`Live layer for "${record.slug}" failed to load`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

  const search = useRouterState({ select: (s) => s.location.searchStr });
  const situation = decodeSituation(search ?? "");
  const sc = scoreRecord(record, situation);

  const brief = decisionBrief(sc, situation);
  const depth = situationDepth(situation);

  const situationLines: [string, string][] = [
    ["Occasion", situation.occasion ?? "not stated"],
    ["Party", situation.partySize ? `${situation.partySize} guests` : "not stated"],
    ["Lead time", situation.leadDays !== null ? `${situation.leadDays} days` : "not stated"],
    ["Daypart", situation.daypart ?? "not stated"],
    ["Spend band", situation.spendBand ?? "not stated"],
    ["Planning tolerance", situation.maxPlanningLoad ?? "not stated"],
    ["Commitment ceiling", situation.maxCommitment ?? "not stated"],
    [
      "Constraints",
      situation.constraints.length ? situation.constraints.join("; ") : "none stated",
    ],
  ];

  const evidence: [string, string][] = [
    ["Service", record.serviceSummary],
    ["Hours", record.hoursSummary],
    ["Reservations", record.reservationDetails],
    ["Price", record.priceDetails],
    ["Dietary", record.dietaryDetails],
    ["Access", record.accessibilityState],
    ["Parking / transit", record.parkingTransit],
    ["Dress", record.dressCode],
    ["Group", record.groupDetails],
    ["Meal length", record.typicalMealLength],
  ];

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-[880px] px-5 py-8 pb-28 print:px-0 print:py-0"
    >
      <JsonLd
        data={breadcrumbs([
          { name: record.title, path: `/record/${record.slug}` },
          { name: "Booking packet", path: `/packet/${record.slug}` },
        ])}
      />
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="tap inline-flex items-center rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to Deep Dish
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() =>
              downloadPacketPdf({
                record,
                situation,
                scored: sc,
                brief,
                generatedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
              })
            }
            className="tap inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
          >
            Download packet PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="tap inline-flex items-center rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Print
          </button>
        </div>
      </div>

      <article className="plate space-y-5 p-7 print:border-0 print:p-0">
        <header className="border-b border-border-strong pb-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-eyebrow">Salty &amp; Clever</span>
            <span className="h-px w-8 bg-border-strong" />
            <span className="text-eyebrow">Restaurant decision brief</span>
          </div>
          <h1 className="mt-4 font-display text-4xl leading-[1.02] tracking-[-0.02em]">
            {record.title}
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {record.address || record.region}
          </p>
          <p className="text-num mt-1 text-[12px] text-subtle">
            Fit {sc.fit}/100 · confirm burden {sc.burden}/100 · situation {depth}/{SITUATION_SLOTS}{" "}
            · reviewed {record.reviewedAt} · next review {record.nextReviewAt}
          </p>
        </header>

        <Section title="Verdict">
          <p className="font-display text-xl leading-snug tracking-tight">{brief.verdict}</p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {brief.fitLine}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {brief.riskLine}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {brief.burdenLine}
          </p>
          <p className="mt-3 border-l-2 border-primary pl-3 text-[13px] leading-relaxed">
            {brief.nextAction}
          </p>
        </Section>

        <Section title="Situation of record">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {situationLines.map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5"
              >
                <dt className="text-[12px] uppercase tracking-[0.12em] text-subtle">{k}</dt>
                <dd className="text-right text-[13px]">{v}</dd>
              </div>
            ))}
          </dl>
          {depth < 3 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-watch">
              This packet was generated from a thin situation. Treat the ordering and verdict as
              provisional until more of the night is described.
            </p>
          ) : null}
        </Section>

        {(["critical", "watch", "unknown"] as const).map((layer) => {
          const list =
            layer === "critical" ? sc.criticals : layer === "watch" ? sc.watch : sc.unknowns;
          if (!list.length) return null;
          return (
            <Section
              key={layer}
              title={
                layer === "critical"
                  ? "Critical risks"
                  : layer === "watch"
                    ? "Watch items"
                    : "Residual unknowns — carried forward, not resolved"
              }
            >
              <ol className="space-y-3">
                {list.map((f) => (
                  <li key={f.id} className="break-inside-avoid">
                    <p className="text-[13px] font-medium">{f.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {f.detail}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-primary">→ {f.action}</p>
                  </li>
                ))}
              </ol>
            </Section>
          );
        })}

        <Section title="At the table">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">What to order</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {live?.dishes?.length
                  ? live.dishes
                      .map((d) => `${d.name} (${d.source === "first-party" ? "house" : "reviews"})`)
                      .join(", ")
                  : "No dish is named on the restaurant's own pages, and nothing repeats across reviews. Ask what the kitchen is known for."}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">What it costs</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {(() => {
                  const spend = spendLine(live);
                  if (!spend) return "No per-guest figure on file.";
                  const total = partyTotal(live, situation.partySize);
                  return `${spend.text}${total ? ` \u00b7 ${total}` : ""} \u2014 ${spend.source.toLowerCase()}.`;
                })()}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">If you cancel</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {bookingRiskLine(live)
                  ? `${bookingRiskLine(live)} \u2014 money lost without eating, separate from the meal.`
                  : "No deposit or cancellation fee is stated."}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                Published hours
              </dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {live?.hours
                  ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                      .map((d, i) => {
                        const iv = live.hours?.[i] ?? [];
                        return iv.length
                          ? `${d} ${iv.map(([a, b]) => `${minutesToClock(a)}\u2013${minutesToClock(b)}`).join(", ")}`
                          : `${d} closed`;
                      })
                      .join(" \u00b7 ")
                  : record.hoursSummary || "Hours were not published on the reviewed pages."}
                {live?.hoursSource ? (
                  <span className="mt-1 block text-[11px] text-subtle">
                    {live.hoursSource === "google"
                      ? "Published schedule. Holidays and private events are not in it."
                      : "Read from the restaurant's own hours line. Reconfirm on the day."}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Confirmation script">
          <ol className="space-y-2">
            {(brief.confirmCalls.length ? brief.confirmCalls : record.checklist).map((c, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground">
                <span className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-border-strong" />
                <span>{c}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-subtle">
            Contact of record: {record.hasPhone ? record.phone : "no phone published"}
            {record.reservationUrl ? ` · ${record.reservationUrl}` : ""}
          </p>
        </Section>

        <Section title="Evidence extract">
          <dl className="divide-y divide-border">
            {evidence
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[130px_1fr] sm:gap-4">
                  <dt className="text-[12px] uppercase tracking-[0.12em] text-subtle">{k}</dt>
                  <dd className="text-[13px] leading-relaxed text-muted-foreground">{v}</dd>
                </div>
              ))}
          </dl>
        </Section>

        <Section title="Sources and limits">
          <ul className="space-y-1">
            {record.sources.map((s) => (
              <li key={s} className="break-all text-[12px] text-muted-foreground">
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-subtle">
            {record.sourceAuthority} · confidence {record.confidence.replace(/_/g, " ")} ·{" "}
            {record.fieldVolatility}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-subtle">{record.disclaimer}</p>
          {record.hasOfficialConflict ? (
            <p className="mt-2 text-[12px] leading-relaxed text-critical">
              An official conflict is open on this record. Both claims are preserved above; resolve
              it by direct contact before committing.
            </p>
          ) : null}
        </Section>
      </article>
    </main>
  );
}
