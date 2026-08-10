import { Chip, Eyebrow, Meter } from "@/components/rih/bits";
import { decisionBrief, type Scored, type Situation } from "@/lib/intelligence";
import { cn } from "@/lib/utils";

export function DecisionBrief({
  sc,
  situation,
  dense = false,
}: {
  sc: Scored;
  situation: Situation;
  dense?: boolean;
}) {
  const b = decisionBrief(sc, situation);
  const tone =
    b.verdictTone === "hold" ? "critical" : b.verdictTone === "conditional" ? "watch" : "verified";

  return (
    <section className="rounded-xl border border-border bg-surface-raised/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Decision brief</Eyebrow>
          <p
            className={cn(
              "mt-1.5 font-display text-lg leading-snug tracking-tight",
              tone === "critical"
                ? "text-critical"
                : tone === "watch"
                  ? "text-watch"
                  : "text-verified",
            )}
          >
            {b.verdict}
          </p>
        </div>
        <div className="flex w-full max-w-[230px] flex-col gap-2.5">
          <Meter label="Situation fit" value={sc.fit} />
          <Meter
            label="Confirm burden"
            value={sc.burden}
            tone={sc.burden >= 70 ? "critical" : sc.burden >= 45 ? "watch" : "primary"}
          />
        </div>
      </div>

      <dl className={cn("mt-4 grid gap-4", dense ? "sm:grid-cols-3" : "sm:grid-cols-3")}>
        <div>
          <dt className="text-eyebrow">Fit</dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{b.fitLine}</dd>
        </div>
        <div>
          <dt className="text-eyebrow">Residual risk</dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{b.riskLine}</dd>
        </div>
        <div>
          <dt className="text-eyebrow">Confirm burden</dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{b.burdenLine}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-lg border border-primary/25 bg-primary/8 p-3.5">
        <Eyebrow className="text-primary/80">Recommended next action</Eyebrow>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">{b.nextAction}</p>
      </div>

      {b.confirmCalls.length ? (
        <div className="mt-4">
          <Eyebrow>Confirmation pass — in order</Eyebrow>
          <ol className="mt-2 space-y-1.5">
            {b.confirmCalls.map((c, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                <span className="text-num text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <span>{c}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {sc.record.hasOfficialConflict ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone="critical">Official conflict preserved</Chip>
          <span className="text-[12px] text-subtle">
            Both claims remain on the record. Nothing has been collapsed to the friendlier statement.
          </span>
        </div>
      ) : null}
    </section>
  );
}
