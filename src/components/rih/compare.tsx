import { formatDistance, openLabel, partyTotal, spendLine } from "@/lib/live";
import { Chip, Eyebrow, Meter } from "@/components/rih/bits";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { RestaurantRecord } from "@/lib/dataset";
import { decisionBrief, type Scored, type Situation } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

const OPEN = /^(unstated|not stated|unknown|—|-|none)$/i;

function isOpenValue(value: string): boolean {
  const t = value.trim();
  return !t || OPEN.test(t);
}

/** First-party menu architecture only — never invents a format. */
function architectureLine(r: RestaurantRecord): string {
  const blob = [r.menuSummary, r.serviceSummary, r.beverageDetails].filter(Boolean).join(" · ");
  const hits: string[] = [];
  if (/tasting|prix fixe|six-course|multi-course|chef'?s menu|format lock/i.test(blob)) {
    hits.push("Tasting / format lock");
  }
  if (/small plates|shared|family.?style|snacks|communal/i.test(blob)) {
    hits.push("Small plates / shared");
  }
  if (/a la carte|à la carte|entree|larger plates/i.test(blob)) {
    hits.push("A la carte");
  }
  if (/lounge|bar menu|counter|happy hour/i.test(blob)) {
    hits.push("Lounge / bar path");
  }
  if (hits.length) return hits.join(" · ");
  if (r.signals.commitment) return r.signals.commitment;
  return "unstated";
}

function domainCritical(sc: Scored, domain: string): boolean {
  return sc.findings.some((f) => f.domain === domain && f.layer === "critical" && f.situational);
}

function domainTitle(sc: Scored, domain: string): string | null {
  return sc.findings.find((f) => f.domain === domain && f.situational)?.title ?? null;
}

type Row = {
  label: string;
  get: (sc: Scored) => string;
  held?: (sc: Scored) => boolean;
};

export function CompareTray({
  items,
  onRemove,
  onOpen,
  onClear,
}: {
  items: Scored[];
  onRemove: (slug: string) => void;
  onOpen: () => void;
  onClear: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="no-print fixed inset-x-0 bottom-[var(--night-bar-h,0px)] z-50 border-t border-border-strong bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Eyebrow>Comparison ({items.length}/3)</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {items.map((sc) => (
            <button
              key={sc.record.slug}
              type="button"
              onClick={() => onRemove(sc.record.slug)}
              className="tap min-h-11 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-muted-foreground hover:border-critical/40 hover:text-critical sm:min-h-0"
            >
              {sc.record.title} ×
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="tap min-h-11 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:min-h-0"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onOpen}
            disabled={items.length < 2}
            className="tap min-h-11 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40 sm:min-h-0"
          >
            Compare side by side
          </button>
        </div>
      </div>
    </div>
  );
}

export function CompareDialog({
  open,
  items,
  situation,
  onClose,
}: {
  open: boolean;
  items: Scored[];
  situation: Situation;
  onClose: () => void;
}) {
  const allergy = situation.constraints.includes("Severe allergy / celiac");
  const mobility = situation.constraints.includes("Mobility / step-free needs");
  const privateNeed = situation.constraints.includes("Private / semi-private required");

  const rows: Row[] = [
    {
      label: "Distance",
      get: (s) =>
        s.distanceMi !== null
          ? formatDistance(s.distanceMi, s.distanceExact) + (s.distanceExact ? "" : " (city-level)")
          : "no origin set",
    },
    {
      label: situation.arriveAt ? "At your time" : "Right now",
      get: (s) => openLabel(s.open).text,
      held: (s) => s.open.state === "closed" || s.open.state === "closed-today",
    },
    {
      label: "Per guest",
      get: (s) => {
        const line = spendLine(s.live);
        if (!line) return s.live?.band ?? "unstated";
        const total = partyTotal(s.live, situation.partySize);
        return `${line.text.replace(/^About /, "")}${total ? ` · ${total}` : ""}`;
      },
    },
    {
      label: "Known for",
      get: (s) =>
        s.live?.dishes
          ?.map((d) => d.name)
          .slice(0, 3)
          .join(", ") || "no dish named",
    },
    {
      label: "Neighbourhood",
      get: (s) => s.live?.hood ?? s.record.city ?? "unstated",
    },
    {
      label: "Step-free",
      get: (s) => {
        const a = s.live?.a11y;
        if (!a) return s.record.accessibilityState || "not stated";
        const parts = [
          a.entrance && "entrance",
          a.restroom && "restroom",
          a.seating && "seating",
        ].filter(Boolean);
        return parts.length ? `reported: ${parts.join(", ")}` : "not stated";
      },
    },
    {
      label: "The complaint",
      get: (s) => s.live?.rep?.complaints?.[0] ?? "no pattern researched",
    },
    {
      label: "Spend band",
      get: (s) => (s.record.spendBands ?? []).join(", ") || "unstated",
    },
    {
      label: "Menu architecture",
      get: (s) => architectureLine(s.record),
    },
    {
      label: "Dietary hold",
      get: (s) => {
        if (allergy && domainCritical(s, "dietary")) {
          return domainTitle(s, "dietary") ?? "Held closed — allergy path unconfirmed";
        }
        return s.record.dietaryTags.join(", ") || s.record.dietaryDetails || "unstated";
      },
      held: (s) => allergy && domainCritical(s, "dietary"),
    },
    {
      label: "Access",
      get: (s) => {
        if (mobility && domainCritical(s, "access")) {
          return domainTitle(s, "access") ?? "Held closed — access route unconfirmed";
        }
        return s.record.accessibilityTags.join(", ") || s.record.accessibilityState || "unstated";
      },
      held: (s) => mobility && domainCritical(s, "access"),
    },
    {
      label: "Private room",
      get: (s) => {
        if (privateNeed && domainCritical(s, "party")) {
          return domainTitle(s, "party") ?? "Held closed — private path unconfirmed";
        }
        return s.record.signals.private ?? "unstated";
      },
      held: (s) => privateNeed && domainCritical(s, "party"),
    },
    { label: "Region", get: (s) => s.record.region },
    { label: "Format", get: (s) => s.record.signals.commitment ?? "unstated" },
    { label: "Booking", get: (s) => s.record.signals.booking ?? "unstated" },
    { label: "Pathways", get: (s) => s.record.bookingPlatforms.join(", ") || "unstated" },
    { label: "Pacing", get: (s) => s.record.signals.pacing ?? "unstated" },
    { label: "Noise band", get: (s) => s.record.noiseBand ?? "unstated" },
    { label: "Formality", get: (s) => s.record.formalityBand ?? "unstated" },
    { label: "Party", get: (s) => s.record.signals.party ?? "unstated" },
    { label: "Wine", get: (s) => s.record.signals.wine ?? "unstated" },
    { label: "Planning load", get: (s) => s.record.planningLoad ?? "unstated" },
    {
      label: "Conflict",
      get: (s) => (s.record.hasOfficialConflict ? "Open — preserved" : "None"),
    },
    { label: "Review", get: (s) => `${s.record.reviewedAt} → ${s.record.nextReviewAt}` },
    { label: "Unknowns", get: (s) => String(s.record.unknownsCount) },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(1180px,96vw)] max-w-none overflow-hidden border-border bg-surface p-0 sm:max-w-none">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <Eyebrow>Comparison</Eyebrow>
          <DialogTitle className="mt-2 font-display text-2xl font-normal tracking-tight">
            {items.map((i) => i.record.title).join("  ·  ")}
          </DialogTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Ranked against the same situation. Fail-closed holds stay visible. Unknowns are held
            open and shown as unknown.
          </p>
        </div>
        <div className="scroll-slim max-h-[74vh] overflow-y-auto px-5 py-5 sm:px-6">
          <div
            className="grid gap-4 sm:[grid-template-columns:repeat(var(--cmp-cols),minmax(0,1fr))]"
            style={{ "--cmp-cols": items.length } as React.CSSProperties}
          >
            {items.map((sc) => {
              const b = decisionBrief(sc, situation);
              return (
                <div
                  key={sc.record.slug}
                  className="rounded-xl border border-border bg-surface-raised/50 p-4"
                >
                  <p className="font-display text-lg tracking-tight">{sc.record.title}</p>
                  <p className="mt-1 text-[12px] text-subtle">rank {sc.rank}</p>
                  <div className="mt-3 space-y-2.5">
                    <Meter label="Fit" value={sc.fit} />
                    <Meter
                      label="To confirm"
                      value={sc.burden}
                      tone={sc.burden >= 70 ? "critical" : sc.burden >= 45 ? "watch" : "primary"}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip tone="critical">{sc.criticals.length} critical</Chip>
                    <Chip tone="watch">{sc.watch.length} watch</Chip>
                    <Chip tone="unknown">{sc.unknowns.length} unknown</Chip>
                    {sc.blocked ? <Chip tone="critical">Held closed</Chip> : null}
                  </div>
                  <p
                    className={cn(
                      "mt-3 text-[13px] leading-snug",
                      b.verdictTone === "hold"
                        ? "text-critical"
                        : b.verdictTone === "conditional"
                          ? "text-watch"
                          : "text-verified",
                    )}
                  >
                    {b.verdict}
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    {b.nextAction}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-[12px] text-subtle">
            A <span className="text-primary">·</span> marks a row where the rooms actually differ —
            those are the rows worth reading.
          </p>

          {/* Wide: a true comparison matrix. */}
          <table className="mt-2 hidden w-full border-collapse text-left sm:table">
            <caption className="sr-only">
              {items.map((i) => i.record.title).join(", ")} compared across {rows.length} dimensions
            </caption>
            <thead>
              <tr>
                <td />
                {items.map((sc) => (
                  <th
                    key={sc.record.slug}
                    scope="col"
                    className="pb-2 pr-4 text-left text-[12px] font-medium text-foreground"
                  >
                    {sc.record.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = items.map(row.get);
                const holds = items.map((sc) => Boolean(row.held?.(sc)));
                const diverges = new Set(values).size > 1;
                return (
                  <tr key={row.label} className="border-t border-border align-top">
                    <th scope="row" className="text-eyebrow w-[140px] py-3 pr-4 font-normal">
                      {row.label}
                      {diverges ? <span className="ml-1.5 text-primary">·</span> : null}
                    </th>
                    {values.map((v, i) => {
                      const held = holds[i];
                      const open = !held && isOpenValue(v);
                      return (
                        <td
                          key={i}
                          className={cn(
                            "py-3 pr-4 text-[13px] leading-relaxed",
                            held && "bg-critical-soft px-2 text-critical",
                            open && "bg-unknown-soft px-2 text-unknown",
                            !held &&
                              !open &&
                              (diverges ? "text-foreground" : "text-muted-foreground"),
                          )}
                        >
                          {v || "not stated"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Phone: one block per dimension, rooms stacked and labelled. */}
          <dl className="mt-2 sm:hidden">
            {rows.map((row) => {
              const values = items.map(row.get);
              const holds = items.map((sc) => Boolean(row.held?.(sc)));
              const diverges = new Set(values).size > 1;
              return (
                <div key={row.label} className="border-t border-border py-3">
                  <dt className="text-eyebrow">
                    {row.label}
                    {diverges ? <span className="ml-1.5 text-primary">·</span> : null}
                  </dt>
                  <dd className="mt-1.5 space-y-1.5">
                    {items.map((sc, i) => {
                      const v = values[i] ?? "";
                      const held = holds[i];
                      const open = !held && isOpenValue(v);
                      return (
                        <div
                          key={sc.record.slug}
                          className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3"
                        >
                          <span className="truncate text-[12px] text-subtle">
                            {sc.record.title}
                          </span>
                          <span
                            className={cn(
                              "text-[13px] leading-relaxed",
                              held && "text-critical",
                              open && "text-unknown",
                              !held &&
                                !open &&
                                (diverges ? "text-foreground" : "text-muted-foreground"),
                            )}
                          >
                            {v || "not stated"}
                          </span>
                        </div>
                      );
                    })}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
