import { Chip } from "@/components/rih/bits";
import { FindingRow } from "@/components/rih/findings";
import { ListingFace } from "@/components/rih/listing-face";
import { isUnstated } from "@/lib/case-depth";
import { enrichmentAudit, ownedSiteEvidence } from "@/lib/enrichment";
import { conditionChips, scenarioChips } from "@/lib/scenario-chips";
import type { Scored, Situation } from "@/lib/intelligence";
import { useShortlist } from "@/lib/shortlist";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export function RecordCard({
  sc,
  situation,
  onOpen,
  onCompare,
  compared,
}: {
  sc: Scored;
  situation: Situation;
  onOpen: () => void;
  onCompare: () => void;
  compared: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fitPulse, setFitPulse] = useState(false);
  const shortlist = useShortlist();
  const r = sc.record;
  const lead = sc.findings.slice(0, open ? sc.findings.length : 2);
  const sitChips = scenarioChips(situation);
  const condChips = conditionChips(r, situation, sc.blocked);
  const audit = enrichmentAudit(r.slug);
  const owned = ownedSiteEvidence(r.slug);
  const quoteCount = owned.groups.reduce((n, g) => n + g.quotes.length, 0);
  const completeness = audit.completeness;
  const completenessTone =
    completeness == null
      ? "unknown"
      : completeness >= 70
        ? "verified"
        : completeness >= 50
          ? "watch"
          : "unknown";

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setFitPulse(true);
    const t = window.setTimeout(() => setFitPulse(false), 520);
    return () => window.clearTimeout(t);
  }, [sc.fit, sc.rank]);

  return (
    <article
      className={cn(
        "group relative rounded-2xl border bg-surface transition-all duration-500 ease-instrument will-change-transform",
        sc.blocked
          ? "border-critical/30"
          : "border-border hover:border-border-strong hover:shadow-lift",
        fitPulse && !sc.blocked && "border-primary/25",
      )}
      data-rank={sc.rank}
      data-blocked={sc.blocked ? "1" : "0"}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <ListingFace
          record={r}
          rank={sc.rank}
          fit={sc.fit}
          burden={sc.burden}
          size={72}
          className="sm:w-[104px]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-xl leading-tight tracking-tight sm:text-[22px]">
                {r.title}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {r.region} · {r.cuisineTags.slice(0, 3).join(" · ") || "style unstated"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {situation.occasion ? (
                <p className="text-[11px] text-subtle">
                  {situation.occasion} fit <span className="text-num">{sc.occasionScore}</span>
                </p>
              ) : null}
              {completeness != null ? (
                <p className="mt-1">
                  <Chip tone={completenessTone}>
                    First-party {completeness}%
                    {quoteCount ? ` · ${quoteCount} quote${quoteCount === 1 ? "" : "s"}` : ""}
                  </Chip>
                </p>
              ) : (
                <p className="mt-1">
                  <Chip tone="unknown">Not enough first-party evidence yet</Chip>
                </p>
              )}
              <p className="mt-1">
                <Chip tone={r.isFullCaseFile ? "verified" : "watch"}>{r.depthLabel}</Chip>
              </p>
            </div>
          </div>

          {(sitChips.length > 0 || condChips.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sitChips.map((c) => (
                <Chip key={c.id} tone={c.tone}>
                  {c.label}
                </Chip>
              ))}
              {condChips.map((c) => (
                <Chip key={c.id} tone={c.tone}>
                  {c.label}
                </Chip>
              ))}
            </div>
          )}

          {sc.reasons.length ? (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              <span className="text-eyebrow mr-2 align-middle">Why here</span>
              {sc.reasons.join(" · ")}
            </p>
          ) : null}

          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {isUnstated(r.serviceSummary) ? "Service format unstated on the restaurant's own pages." : r.serviceSummary}
          </p>

          {r.nextAction ? (
            <p className="mt-3 rounded-lg border border-border bg-surface-sunken/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
              <span className="text-eyebrow mr-2">Next</span>
              {r.nextAction}
            </p>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface-sunken/50 px-4 transition-[max-height] duration-500 ease-instrument">
            <ul className="divide-y divide-border">
              {lead.map((f) => (
                <FindingRow key={f.id} f={f} compact />
              ))}
            </ul>
            {sc.findings.length > 2 ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="tap w-full border-t border-border py-2.5 text-[11px] uppercase tracking-[0.16em] text-subtle transition-colors hover:text-primary"
              >
                {open
                  ? "Collapse findings"
                  : `Show ${sc.findings.length - 2} further finding${sc.findings.length - 2 === 1 ? "" : "s"} · ${sc.criticals.length} critical · ${sc.watch.length} watch · ${sc.unknowns.length} unknown`}
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="tap rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open case file
            </button>
            <Link
              to="/record/$slug"
              params={{ slug: r.slug }}
              className="tap rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Full dossier
            </Link>
            <button
              type="button"
              onClick={() => shortlist.toggle(r.slug)}
              className={cn(
                "tap rounded-full border px-4 py-2 text-xs transition-colors",
                shortlist.has(r.slug)
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {shortlist.has(r.slug) ? "On night plan" : "Add to night plan"}
            </button>
            <button
              type="button"
              onClick={onCompare}
              className={cn(
                "tap rounded-full border px-4 py-2 text-xs transition-colors",
                compared
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {compared ? "In comparison" : "Compare"}
            </button>

            {r.reservationUrl || r.website ? (
              <a
                href={r.reservationUrl || r.website}
                target="_blank"
                rel="noreferrer"
                className="tap rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                Booking pathway ({r.bookingPlatforms[0] ?? "direct"})
              </a>
            ) : null}
            {r.hasPhone ? (
              <a
                href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                className="text-num tap rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {r.phone}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
