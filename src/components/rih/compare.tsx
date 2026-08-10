import { Chip, Eyebrow, Meter } from "@/components/rih/bits";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { decisionBrief, type Scored, type Situation } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

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
    <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border-strong bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Eyebrow>Comparison ({items.length}/3)</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {items.map((sc) => (
            <button
              key={sc.record.slug}
              type="button"
              onClick={() => onRemove(sc.record.slug)}
              className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-muted-foreground hover:border-critical/40 hover:text-critical"
            >
              {sc.record.title} ×
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onOpen}
            disabled={items.length < 2}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
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
  const rows: { label: string; get: (sc: Scored) => string }[] = [
    { label: "Region", get: (s) => s.record.region },
    { label: "Format", get: (s) => s.record.signals.commitment ?? "unstated" },
    { label: "Booking", get: (s) => s.record.signals.booking ?? "unstated" },
    { label: "Pathways", get: (s) => s.record.bookingPlatforms.join(", ") },
    { label: "Pacing", get: (s) => s.record.signals.pacing ?? "unstated" },
    { label: "Noise band", get: (s) => s.record.noiseBand ?? "unstated" },
    { label: "Formality", get: (s) => s.record.formalityBand ?? "unstated" },
    { label: "Party", get: (s) => s.record.signals.party ?? "unstated" },
    { label: "Private", get: (s) => s.record.signals.private ?? "Not stated" },
    { label: "Wine", get: (s) => s.record.signals.wine ?? "unstated" },
    { label: "Planning load", get: (s) => s.record.planningLoad ?? "unstated" },
    { label: "Spend band", get: (s) => (s.record.spendBands ?? []).join(", ") || "unstated" },
    { label: "Access", get: (s) => s.record.accessibilityTags.join(", ") },
    { label: "Dietary", get: (s) => s.record.dietaryTags.join(", ") },
    { label: "Conflict", get: (s) => (s.record.hasOfficialConflict ? "Open — preserved" : "None") },
    { label: "Review", get: (s) => `${s.record.reviewedAt} → ${s.record.nextReviewAt}` },
    { label: "Unknowns", get: (s) => String(s.record.unknownsCount) },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(1180px,96vw)] max-w-none overflow-hidden border-border bg-surface p-0 sm:max-w-none">
        <div className="border-b border-border px-6 py-5">
          <Eyebrow>Comparison</Eyebrow>
          <DialogTitle className="mt-2 font-display text-2xl font-normal tracking-tight">
            {items.map((i) => i.record.title).join("  ·  ")}
          </DialogTitle>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Ranked against the same situation. Divergent values are marked; unknowns are not filled
            in to make a column look complete.
          </p>
        </div>
        <div className="scroll-slim max-h-[74vh] overflow-y-auto px-6 py-5">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}
          >
            {items.map((sc) => {
              const b = decisionBrief(sc, situation);
              return (
                <div
                  key={sc.record.slug}
                  className="rounded-xl border border-border bg-surface-raised/50 p-4"
                >
                  <p className="font-display text-lg tracking-tight">{sc.record.title}</p>
                  <p className="mt-1 text-[12px] text-subtle">
                    rank {sc.rank} · {sc.record.recordId}
                  </p>
                  <div className="mt-3 space-y-2.5">
                    <Meter label="Fit" value={sc.fit} />
                    <Meter
                      label="Burden"
                      value={sc.burden}
                      tone={sc.burden >= 70 ? "critical" : sc.burden >= 45 ? "watch" : "primary"}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Chip tone="critical">{sc.criticals.length} critical</Chip>
                    <Chip tone="watch">{sc.watch.length} watch</Chip>
                    <Chip tone="unknown">{sc.unknowns.length} unknown</Chip>
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

          <table className="mt-6 w-full border-collapse text-left">
            <tbody>
              {rows.map((row) => {
                const values = items.map(row.get);
                const diverges = new Set(values).size > 1;
                return (
                  <tr key={row.label} className="border-t border-border align-top">
                    <th
                      scope="row"
                      className="text-eyebrow w-[140px] py-3 pr-4 font-normal"
                    >
                      {row.label}
                      {diverges ? <span className="ml-1.5 text-primary">·</span> : null}
                    </th>
                    {values.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          "py-3 pr-4 text-[13px] leading-relaxed",
                          diverges ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {v || "not stated"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
