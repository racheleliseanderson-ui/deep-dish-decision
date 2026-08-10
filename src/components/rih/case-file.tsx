import { Chip, Eyebrow, Rule } from "@/components/rih/bits";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { LayerStack } from "@/components/rih/findings";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
        showCloseButton
        className="max-h-[92vh] w-[min(1040px,96vw)] max-w-none overflow-hidden border-border bg-surface p-0 sm:max-w-none"
      >
        <div className="grain-veil relative border-b border-border px-6 py-5">
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

        <div className="scroll-slim max-h-[62vh] overflow-y-auto px-6 py-5">
          {tab === "Brief" ? (
            <div className="space-y-5">
              <DecisionBrief sc={sc} situation={situation} />
              <div>
                <Eyebrow>Recorded occasion fit</Eyebrow>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {r.occasionFit}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(r.signals).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border bg-surface-raised/50 p-3">
                    <p className="text-eyebrow">{k}</p>
                    <p className="mt-1 text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "Findings" ? (
            <div className="space-y-6">
              <LayerStack title="Critical risks" layer="critical" findings={sc.criticals} />
              <LayerStack title="Watch items" layer="watch" findings={sc.watch} />
              <LayerStack title="Residual unknowns" layer="unknown" findings={sc.unknowns} />
              {!sc.findings.length ? (
                <p className="text-sm text-muted-foreground">
                  No findings surfaced for this situation. That is not a guarantee — it means the
                  record carries no recorded conflict, thin field, or constraint mismatch against
                  what you have entered so far.
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "Evidence" ? (
            <div>
              <dl className="divide-y divide-border">
                {rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="grid gap-1 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                      <dt className="text-eyebrow pt-0.5">{k}</dt>
                      <dd className="text-[13px] leading-relaxed text-muted-foreground">{v}</dd>
                    </div>
                  ))}
              </dl>
              <Rule />
              <Eyebrow>Unknowns, held open</Eyebrow>
              <ul className="mt-2 space-y-1">
                {r.unknownList.map((u) => (
                  <li key={u} className="text-[13px] text-muted-foreground">
                    · {u}
                  </li>
                ))}
              </ul>
              <Rule />
              <Eyebrow>First-party sources</Eyebrow>
              <ul className="mt-2 space-y-1">
                {r.sources.map((s) => (
                  <li key={s}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] text-accent underline-offset-4 hover:underline"
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[12px] leading-relaxed text-subtle">
                {r.sourceAuthority} · confidence {r.confidence.replace(/_/g, " ")} ·{" "}
                {r.fieldVolatility}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-subtle">{r.disclaimer}</p>
            </div>
          ) : null}

          {tab === "Confirmation" ? (
            <div>
              <Eyebrow>Confirmation checklist</Eyebrow>
              <ul className="mt-2 space-y-2">
                {r.checklist.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised/40 px-3 py-2.5 text-[13px] text-muted-foreground"
                  >
                    <span className="mt-1 size-3.5 shrink-0 rounded-[4px] border border-border-strong" />
                    {c}
                  </li>
                ))}
              </ul>
              <Rule />
              <Eyebrow>Next action on record</Eyebrow>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {r.nextAction}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-sunken/60 px-6 py-4">
          <a
            href={packetHref(r.slug)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Build decision packet
          </a>
          {r.reservationUrl || r.website ? (
            <a
              href={r.reservationUrl || r.website}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Official booking pathway
            </a>
          ) : null}
          {r.menuUrl ? (
            <a
              href={r.menuUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Menu source
            </a>
          ) : null}
          {r.hasPhone ? (
            <a
              href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
              className="text-num rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {r.phone}
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
