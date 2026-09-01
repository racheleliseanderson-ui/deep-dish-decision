import { Chip, Eyebrow } from "@/components/rih/bits";
import { ListingFace } from "@/components/rih/listing-face";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { DinerQuestions } from "@/components/rih/diner-questions";
import { FindingsStack } from "@/components/rih/findings";
import { InspectionPanel } from "@/components/rih/inspection-panel";
import { ReputationPanel } from "@/components/rih/reputation-panel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CASE_FIELDS, fieldDisplay, isUnstated } from "@/lib/case-depth";
import { enrichmentAudit, ownedSiteEvidence } from "@/lib/enrichment";
import { useEnrichmentGroup } from "@/hooks/use-enrichment";
import type { Scored, Situation } from "@/lib/intelligence";
import { useEffect, useState } from "react";

const TABS = ["Tonight", "Brief", "Findings", "Evidence", "Confirmation"] as const;
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
  const [tab, setTab] = useState<Tab>("Tonight");
  const slug = sc?.record.slug;
  // The open record's region only. Until it lands both lookups read as absent,
  // which is the same thing they show for a record that was never enriched.
  const enrichmentReady = useEnrichmentGroup(sc?.record.regionGroup);
  useEffect(() => {
    setTab("Tonight");
  }, [slug]);
  if (!sc) return null;
  const r = sc.record;
  const statedCount = CASE_FIELDS.filter((f) => !isUnstated(String(r[f.key] ?? ""))).length;

  return (
    <Dialog open={!!sc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[92vh] w-[min(1040px,96vw)] max-w-none overflow-hidden border-border bg-surface p-0 sm:max-w-none"
      >
        <div className="grain-veil relative border-b border-border px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <ListingFace record={r} fit={sc.fit} burden={sc.burden} rank={sc.rank} size={72} showGauges />
            <div className="min-w-0 flex-1">
              <Eyebrow>Case file</Eyebrow>
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
                <Chip tone={r.isFullCaseFile ? "verified" : "watch"}>{r.depthLabel}</Chip>
                <Chip tone={statedCount >= 8 ? "verified" : "watch"}>
                  {statedCount}/{CASE_FIELDS.length} stated
                </Chip>
                <Chip>Reviewed {r.reviewedAt}</Chip>
                {(() => {
                  const audit = enrichmentReady
                    ? enrichmentAudit(r.slug)
                    : { present: false as const, completeness: null, fields: [] };
                  return audit.present ? (
                    <Chip tone="unknown">
                      First-party file {audit.completeness ?? "—"}%
                    </Chip>
                  ) : (
                    <Chip tone="neutral">First-party evidence only</Chip>
                  );
                })()}
              </div>
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  "min-h-11 rounded-full px-3.5 py-1.5 text-xs transition-colors sm:min-h-0 " +
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
          {tab === "Tonight" ? (
            <div className="space-y-8">
              <DinerQuestions record={r} />
              <ReputationPanel slug={r.slug} />
              <InspectionPanel slug={r.slug} />
            </div>
          ) : null}
          {tab === "Brief" ? (
            <DecisionBrief sc={sc} situation={situation} />
          ) : null}
          {tab === "Findings" ? <FindingsStack findings={sc.findings} /> : null}
          {tab === "Evidence" ? (
            <div className="space-y-8">
              {(() => {
                const owned = enrichmentReady
                  ? ownedSiteEvidence(r.slug)
                  : null;
                if (!owned?.present) return null;
                return (
                  <section>
                    <Eyebrow>From the restaurant's own pages</Eyebrow>
                    <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                      Quoted language from {owned.pagesRead || "the"} owned page
                      {owned.pagesRead === 1 ? "" : "s"}
                      {owned.retrievedAt ? ` · read ${owned.retrievedAt.slice(0, 10)}` : ""}. Hours,
                      telephone, price, cuisine, menu and reservation paths are written onto the
                      case file when those pages state them. Remaining fields stay unstated on
                      the same floor as every other record.
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
                              {group.applied ? "Written onto the case file" : "Quoted, not applied as fact"}
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
                <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                  Every record uses this same field set. Unstated means the restaurant's own
                  pages were silent — not that the instrument guessed.
                </p>
                <dl className="mt-3 divide-y divide-border">
                  {CASE_FIELDS.map((field) => {
                    const display = fieldDisplay(String(r[field.key] ?? ""));
                    return (
                      <div key={field.label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
                        <dt className="text-eyebrow pt-0.5 flex flex-wrap items-center gap-2">
                          {field.label}
                          <Chip tone={display.unstated ? "unknown" : "verified"} className="font-normal">
                            {display.unstated ? "Unstated" : "Stated"}
                          </Chip>
                        </dt>
                        <dd
                          className={
                            display.unstated
                              ? "text-[13px] leading-relaxed text-unknown"
                              : "text-[13px] leading-relaxed text-muted-foreground"
                          }
                        >
                          {display.text}
                        </dd>
                      </div>
                    );
                  })}
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
                  className="tap min-h-11 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                >
                  Open decision packet
                </a>
                {r.reservationUrl || r.website ? (
                  <a
                    href={r.reservationUrl || r.website}
                    target="_blank"
                    rel="noreferrer"
                    className="tap min-h-11 rounded-full border border-border px-4 py-2 text-xs"
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
