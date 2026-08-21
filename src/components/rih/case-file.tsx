import { Chip, Eyebrow, Rule } from "@/components/rih/bits";
import { ListingFace } from "@/components/rih/listing-face";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { FindingsStack } from "@/components/rih/findings";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { enrichmentAudit, ownedSiteEvidence } from "@/lib/enrichment";
import type { Scored, Situation } from "@/lib/intelligence";
import { useState } from "react";

const TABS = ["Brief", "Findings", "Evidence", "Confirmation"] as const;
type Tab = (typeof TABS)[number];

export function CaseFile({
  sc,
  situation,
  onClose,
  packetHref,
}: {
  sc: Scored | null;
  situation: Situation;
  onClose: () => void;
  packetHref: (slug: string) => string;
}) {
  const [tab, setTab] = useState<Tab>("Brief");
  if (!sc) return null;
  const r = sc.record;

  const rows: [string, string][] = [
    ["Service", r.serviceSummary],
    ["Hours", r.hoursSummary],
    ["Reservations", r.reservationDetails],
    ["Price", r.priceDetails],
    ["Menu", r.menuSummary],
    ["Beverage", r.beverageDetails],
    ["Dietary", r.dietaryDetails],
    ["Access", r.accessibilityState],
    ["Parking / transit", r.parkingTransit],
    ["Dress", r.dressCode],
    ["Group", r.groupDetails],
    ["Atmosphere", r.atmosphereSummary],
    ["Meal length", r.typicalMealLength],
    ["Practical", r.practicalNotes],
  ];

  return (
    <Dialog open={!!sc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[92vh] w-[min(1040px,96vw)] max-w-none overflow-hidden border-border bg-surface p-0 sm:max-w-none"
      >
        <div className="grain-veil relative border-b border-border px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <ListingFace record={r} fit={sc.fit} burden={sc.burden} rank={sc.rank} size={72} showGauges />
            <div className="min-w-0 flex-1">
              <Eyebrow>Case file · {r.recordId}</Eyebrow>
              <DialogTitle className="mt-2 font-display text-2xl font-normal leading-tight tracking-tight">
                {r.title}
              </DialogTitle>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {r.address || r.region} · {r.coverageArea || r.region}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="accent">Fit {sc.fit}</Chip>
                <Chip tone={sc.burden >= 70 ? "critical" : sc.burden >= 45 ? "watch" : "neutral"}>
                  Confirm burden {sc.burden}
                </Chip>
                {r.hasOfficialConflict ? <Chip tone="critical">Official conflict</Chip> : null}
                <Chip tone="unknown">{r.unknownsCount} unknowns</Chip>
                <Chip>{r.depthLabel}</Chip>
                <Chip>Reviewed {r.reviewedAt}</Chip>
                {(() => {
                  const audit = enrichmentAudit(r.slug);
                  return audit.present ? (
                    <Chip tone="unknown">
                      Enrichment {audit.completeness ?? "—"}% · {audit.matchStatus ?? "matched"}
                    </Chip>
                  ) : (
                    <Chip tone="neutral">No third-party enrichment</Chip>
                  );
                })()}
              </div>
            </div>
          </div>
          <nav className="mt-4 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  "rounded-full px-3.5 py-1.5 text-xs transition-colors " +
                  (tab === t
                    ? "bg-primary/14 text-primary"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        <div className="max-h-[calc(92vh-180px)] overflow-y-auto px-6 py-5">
          {tab === "Brief" ? (
            <DecisionBrief sc={sc} situation={situation} />
          ) : null}
          {tab === "Findings" ? <FindingsStack findings={sc.findings} /> : null}
          {tab === "Evidence" ? (
            <div className="space-y-8">
              {(() => {
                const owned = ownedSiteEvidence(r.slug);
                if (!owned.present) return null;
                return (
                  <section>
                    <Eyebrow>From the restaurant's own pages</Eyebrow>
                    <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                      Quoted language from {owned.pagesRead || "the"} owned page
                      {owned.pagesRead === 1 ? "" : "s"}
                      {owned.retrievedAt ? ` · read ${owned.retrievedAt.slice(0, 10)}` : ""}. Structured
                      hours, telephone, price and cuisine count toward completeness. Schema and
                      hydration quotes stay labeled and are not treated as confirmed policy.
                    </p>
                    {owned.menuUrl || owned.reservationUrl ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {owned.menuUrl ? (
                          <a
                            href={owned.menuUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="tap rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:border-gilt hover:text-foreground"
                          >
                            Menu path
                          </a>
                        ) : null}
                        {owned.reservationUrl ? (
                          <a
                            href={owned.reservationUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="tap rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:border-gilt hover:text-foreground"
                          >
                            {owned.reservationPlatform
                              ? `Reserve · ${owned.reservationPlatform}`
                              : "Reservation path"}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-4 divide-y divide-border">
                      {owned.groups.map((group) => (
                        <div key={group.kind} className="py-3">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <p className="text-eyebrow">{group.label}</p>
                            <Chip tone={group.applied ? "verified" : "unknown"}>
                              {group.applied ? "Counts toward completeness" : "Quoted, not applied as fact"}
                            </Chip>
                          </div>
                          <ul className="mt-2 space-y-2">
                            {group.quotes.map((q) => (
                              <li key={q.quote} className="text-[13px] leading-relaxed text-muted-foreground">
                                “{q.quote}”
                                {q.sourceUrl ? (
                                  <a
                                    href={q.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-0.5 block text-[11px] text-subtle hover:text-foreground"
                                  >
                                    {q.sourceUrl.replace(/^https?:\/\//, "")}
                                  </a>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}
              <section>
                <Eyebrow>Recorded fields</Eyebrow>
                <dl className="mt-3 divide-y divide-border">
                  {rows.map(([label, value]) => (
                    <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
                      <dt className="text-eyebrow pt-0.5">{label}</dt>
                      <dd className="text-[13px] leading-relaxed text-muted-foreground">
                        {!value || /^not stated/i.test(value) ? (
                          <span className="text-unknown">Not stated — held open</span>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          ) : null}
          {tab === "Confirmation" ? (
            <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
              <p>
                Confirm hours, pricing, and reservation policy live before you commit. The instrument
                does not invent missing fields.
              </p>
              <p>
                Next review: <span className="text-num text-foreground">{r.nextReviewAt}</span>
              </p>
              {r.nextAction ? <p className="text-foreground">{r.nextAction}</p> : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={packetHref(r.slug)}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                >
                  Open decision packet
                </a>
                {r.reservationUrl || r.website ? (
                  <a
                    href={r.reservationUrl || r.website}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-border px-4 py-2 text-xs"
                  >
                    Booking pathway
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
