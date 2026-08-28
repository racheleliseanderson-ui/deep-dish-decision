import { Link } from "@tanstack/react-router";
import { Button, Chip, Eyebrow, LayerBadge } from "@/components/ui";
import { decisionBrief, sensitivity, situationDepth, SITUATION_SLOTS, topOccasion } from "@/lib/intelligence";
import { useNight } from "@/lib/store";
import type { Scored, Situation } from "@/lib/types";
import { cn } from "@/lib/utils";

function ensureNight(situation: Situation) {
  const st = useNight.getState();
  if (!st.activeId) st.startNight(situation, situation.occasion ?? "Night");
}

export function DecisionBrief({ sc, situation }: { sc: Scored; situation: Situation }) {
  const brief = decisionBrief(sc, situation);
  const tone =
    brief.verdictTone === "hold"
      ? "text-critical"
      : brief.verdictTone === "conditional"
        ? "text-watch"
        : "text-verified";
  return (
    <article className="plate p-5 sm:p-6">
      <Eyebrow>The answer</Eyebrow>
      <h3 className={cn("mt-2 font-display text-2xl tracking-tight", tone)}>{brief.verdict}</h3>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{brief.fitLine}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{brief.riskLine}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-subtle">{brief.burdenLine}</p>
      <p className="mt-4 border-l-2 border-primary pl-3 text-[13px] leading-relaxed">{brief.nextAction}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/confirm/$slug" params={{ slug: sc.record.slug }} onClick={() => ensureNight(situation)}>
            Start confirmation pass
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/record/$slug" params={{ slug: sc.record.slug }}>
            Open the file
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function ResultCard({
  sc,
  situation,
  onShortlist,
  shortlisted,
  onCompare,
  compared,
}: {
  sc: Scored;
  situation: Situation;
  onShortlist: () => void;
  shortlisted: boolean;
  onCompare: () => void;
  compared: boolean;
}) {
  const r = sc.record;
  return (
    <article
      className={cn(
        "plate p-4 sm:p-5",
        sc.blocked && "border-critical/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-num text-[11px] text-gilt">{String(sc.rank).padStart(2, "0")}</span>
            {sc.blocked ? <LayerBadge layer="hold" /> : null}
            <LayerBadge layer={r.freshnessStatus} />
          </div>
          <h3 className="mt-1 font-display text-2xl tracking-tight">
            <Link to="/record/$slug" params={{ slug: r.slug }} className="tap inline-flex min-h-11 items-center hover:text-primary">
              {r.title}
            </Link>
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {r.region} · {r.recordId} · {r.cuisineTags.slice(0, 3).join(" · ")}
          </p>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <p className="text-eyebrow">Fit</p>
            <p className="text-num text-2xl text-primary">
              {sc.fit}
              <span className="text-xs text-subtle">/100</span>
            </p>
          </div>
          <div>
            <p className="text-eyebrow">Confirm</p>
            <p className="text-num text-2xl">
              {sc.burden}
              <span className="text-xs text-subtle">/100</span>
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{r.serviceSummary}</p>

      <ul className="mt-3 space-y-1.5">
        {sc.findings.slice(0, 3).map((f) => (
          <li key={f.id} className="flex gap-2 text-[12px] leading-relaxed">
            <LayerBadge layer={f.layer} />
            <span>
              <span className="text-foreground">{f.title}.</span>{" "}
              <span className="text-muted-foreground">{f.action}</span>
            </span>
          </li>
        ))}
      </ul>

      {sc.reasons.length ? (
        <p className="mt-3 text-[12px] text-subtle">Why this rank: {sc.reasons.join(" · ")}</p>
      ) : (
        <p className="mt-3 text-[12px] text-subtle">
          Strongest recorded use: {topOccasion(r).occasion.toLowerCase()}. Add an occasion to sharpen this.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/confirm/$slug" params={{ slug: r.slug }} onClick={() => ensureNight(situation)}>
            {sc.blocked ? "Confirm anyway — hold the book" : "Start confirmation pass"}
          </Link>
        </Button>
        <Chip active={shortlisted} onClick={onShortlist}>
          {shortlisted ? "On the night" : "Hold as option"}
        </Chip>
        <Chip active={compared} onClick={onCompare}>
          Compare
        </Chip>
        {r.hasPhone ? (
          <a
            className="tap inline-flex items-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
            aria-label={`Call ${r.title}`}
          >
            {r.phone}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function WhatIf({ slug, situation }: { slug: string; situation: Situation }) {
  const rows = sensitivity(situation, slug);
  return (
    <section className="plate p-5">
      <Eyebrow>What would change this answer?</Eyebrow>
      <p className="mt-1 text-[13px] text-muted-foreground">
        One variable at a time against the current lead. The rest of the night stays as you set it.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-[13px]">
            <span>{row.label}</span>
            <span className={cn("text-num", row.blocked ? "text-critical" : row.delta < 0 ? "text-watch" : "text-verified")}>
              {row.blocked ? "hold" : `${row.delta > 0 ? "+" : ""}${row.delta} fit`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DepthNote({ situation }: { situation: Situation }) {
  const depth = situationDepth(situation);
  if (depth >= 3) return null;
  return (
    <p className="rounded-2xl border border-watch/30 bg-watch-soft px-4 py-3 text-[13px] text-watch">
      Situation depth {depth}/{SITUATION_SLOTS}. This ordering is provisional. Add an occasion or a
      guest constraint — those two reshape fail-closed holds the most.
    </p>
  );
}
