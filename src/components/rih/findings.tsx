import { Chip, LayerDot } from "@/components/rih/bits";
import type { Finding, FindingLayer } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

const LABEL: Record<FindingLayer, string> = {
  critical: "Critical",
  watch: "Watch",
  unknown: "Unknown",
};

export function FindingRow({ f, compact = false }: { f: Finding; compact?: boolean }) {
  return (
    <li className="group relative flex gap-3 py-3">
      <LayerDot layer={f.layer} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={cn(
              "text-[11px] font-medium uppercase tracking-[0.14em]",
              f.layer === "critical"
                ? "text-critical"
                : f.layer === "watch"
                  ? "text-watch"
                  : "text-unknown",
            )}
          >
            {LABEL[f.layer]}
          </span>
          <span className="text-[11px] text-subtle">
            {f.domain} · impact <span className="text-num">{f.impact}</span> · {f.confidence}{" "}
            confidence
          </span>
        </div>
        <p className="mt-1 text-sm leading-snug text-foreground">{f.title}</p>
        {f.provenance && f.provenance !== "first-party" ? (
          <p className="mt-1">
            <Chip tone="unknown">
              {f.provenance === "google-places"
                ? "Google listing · labeled"
                : f.provenance === "site-scrape"
                  ? "Venue website · labeled"
                  : "Third-party · labeled"}
            </Chip>
          </p>
        ) : null}
        {!compact && f.detail ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.detail}</p>
        ) : null}
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="text-eyebrow mr-2 align-middle">Do</span>
          {f.action}
        </p>
      </div>
    </li>
  );
}

export function LayerStack({
  title,
  findings,
  layer,
  compact,
}: {
  title: string;
  findings: Finding[];
  layer: FindingLayer;
  compact?: boolean;
}) {
  if (!findings.length) return null;
  return (
    <div>
      <div className="flex items-center gap-2">
        <h4 className="text-eyebrow">{title}</h4>
        <Chip tone={layer}>
          <span className="text-num">{findings.length}</span>
        </Chip>
      </div>
      <ul className="mt-1 divide-y divide-border">
        {findings.map((f) => (
          <FindingRow key={f.id} f={f} compact={compact ?? false} />
        ))}
      </ul>
    </div>
  );
}
