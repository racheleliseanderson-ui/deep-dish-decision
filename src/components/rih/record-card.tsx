import { Chip, Meter } from "@/components/rih/bits";
import { FindingRow } from "@/components/rih/findings";
import type { Scored, Situation } from "@/lib/intelligence";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  const r = sc.record;
  const lead = sc.findings.slice(0, open ? sc.findings.length : 2);

  return (
    <article
      className={cn(
        "group relative rounded-2xl border bg-surface transition-all duration-500 ease-instrument",
        sc.blocked
          ? "border-critical/30"
          : "border-border hover:border-border-strong hover:shadow-lift",
      )}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <div className="flex shrink-0 flex-col items-start gap-3 sm:w-[104px]">
          <div className="flex items-baseline gap-2">
            <span className="text-num text-3xl font-medium leading-none text-primary">
              {String(sc.rank).padStart(2, "0")}
            </span>
          </div>
          <div className="w-full space-y-2.5">
            <Meter label="Fit" value={sc.fit} />
            <Meter
              label="Burden"
              value={sc.burden}
              tone={sc.burden >= 70 ? "critical" : sc.burden >= 45 ? "watch" : "primary"}
            />
          </div>
        </div>

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
              <span className="text-num text-[11px] text-subtle">{r.recordId}</span>
              {situation.occasion ? (
                <p className="text-[11px] text-subtle">
                  {situation.occasion} fit <span className="text-num">{sc.occasionScore}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {sc.blocked ? <Chip tone="critical">Blocked on a stated constraint</Chip> : null}
            {r.hasOfficialConflict ? <Chip tone="critical">Official conflict</Chip> : null}
            {r.reviewStatus === "overdue" ? (
              <Chip tone="critical">Review overdue</Chip>
            ) : r.reviewDueSoon ? (
              <Chip tone="watch">Review due {r.nextReviewAt}</Chip>
            ) : (
              <Chip tone="verified">Review current</Chip>
            )}
            <Chip tone={r.thinFieldCount ? "unknown" : "neutral"}>
              {r.thinFieldCount} thin field{r.thinFieldCount === 1 ? "" : "s"}
            </Chip>
            <Chip tone="unknown">
              <span className="text-num">{r.unknownsCount}</span> unknown
              {r.unknownsCount === 1 ? "" : "s"}
            </Chip>
            <Chip>{r.planningLoad ?? "load unstated"} load</Chip>
            <Chip>{r.depthLabel}</Chip>
          </div>

          {sc.reasons.length ? (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              <span className="text-eyebrow mr-2 align-middle">Why here</span>
              {sc.reasons.join(" · ")}
            </p>
          ) : null}

          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {r.serviceSummary}
          </p>

          <div className="mt-4 rounded-xl border border-border bg-surface-sunken/50 px-4">
            <ul className="divide-y divide-border">
              {lead.map((f) => (
                <FindingRow key={f.id} f={f} compact />
              ))}
            </ul>
            {sc.findings.length > 2 ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full border-t border-border py-2.5 text-[11px] uppercase tracking-[0.16em] text-subtle transition-colors hover:text-primary"
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
              className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open case file
            </button>
            <button
              type="button"
              onClick={onCompare}
              className={cn(
                "rounded-full border px-4 py-2 text-xs transition-colors",
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
                className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                Booking pathway ({r.bookingPlatforms[0] ?? "direct"})
              </a>
            ) : null}
            {r.hasPhone ? (
              <a
                href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                className="text-num rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
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
