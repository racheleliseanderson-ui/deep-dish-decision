import { Chip } from "@/components/rih/bits";
import { ListingFace } from "@/components/rih/listing-face";
import { whyGoLine } from "@/lib/consumer-snapshot";
import type { Finding, Scored, Situation } from "@/lib/intelligence";
import { useShortlist } from "@/lib/shortlist";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

export type DecisionState = "good" | "verify" | "hold";

export function materialFindings(sc: Scored): Finding[] {
  return sc.findings
    .filter((f) => f.situational && (f.layer !== "unknown" || f.impact >= 35))
    .sort((a, b) => b.impact - a.impact);
}

export function decisionState(sc: Scored): DecisionState {
  const material = materialFindings(sc);
  if (sc.blocked || material.some((f) => f.layer === "critical")) return "hold";
  if (material.length || sc.record.hasOfficialConflict) return "verify";
  return "good";
}

const STATE_COPY: Record<DecisionState, { label: string; line: string; tone: "verified" | "watch" | "critical" }> = {
  good: {
    label: "GOOD FIT",
    line: "Nothing material currently blocks this night.",
    tone: "verified",
  },
  verify: {
    label: "VERIFY FIRST",
    line: "Looks right, but something important still needs a live answer.",
    tone: "watch",
  },
  hold: {
    label: "HOLD",
    line: "A hard constraint cannot be supported on the evidence currently held.",
    tone: "critical",
  },
};

export function DecisionCard({
  sc,
  situation,
  onOpen,
}: {
  sc: Scored;
  situation: Situation;
  onOpen: () => void;
}) {
  const r = sc.record;
  const shortlist = useShortlist();
  const state = decisionState(sc);
  const stateCopy = STATE_COPY[state];
  const material = materialFindings(sc);
  const why = sc.reasons.length ? sc.reasons.slice(0, 3).join(" · ") : whyGoLine(r);
  const fitLabel = sc.fit >= 78 ? "Strong fit" : sc.fit >= 62 ? "Promising fit" : "Possible fit";

  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface p-5 transition-colors sm:p-6",
        state === "hold" ? "border-critical/35" : state === "verify" ? "border-watch/35" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <ListingFace
          record={r}
          rank={sc.rank}
          fit={sc.fit}
          burden={sc.burden}
          size={72}
          showGauges={false}
          className="sm:w-[96px]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl leading-tight tracking-tight">{r.title}</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">{r.region} · {r.cuisineTags.slice(0, 2).join(" · ") || "cuisine not stated"}</p>
            </div>
            <Chip tone={stateCopy.tone}>{stateCopy.label}</Chip>
          </div>

          <p className="mt-4 text-sm font-medium text-foreground">{fitLabel} for this night</p>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">Why:</span> {why}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-subtle">{stateCopy.line}</p>

          {material.length ? (
            <div className="mt-4 rounded-xl border border-border bg-surface-sunken/45 p-4">
              <p className="text-eyebrow">
                {material.length} thing{material.length === 1 ? "" : "s"} still need{material.length === 1 ? "s" : ""} confirming
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {material.slice(0, 3).map((finding) => (
                  <li key={finding.id} className="flex gap-2">
                    <span aria-hidden className="text-watch">•</span>
                    <span>{finding.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="tap rounded-full bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {state === "hold" ? "See what is blocking it" : "Check this restaurant"}
            </button>
            <button
              type="button"
              onClick={() => shortlist.toggle(r.slug)}
              aria-pressed={shortlist.has(r.slug)}
              className={cn(
                "tap rounded-full border px-4 py-2.5 text-xs transition-colors",
                shortlist.has(r.slug)
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {shortlist.has(r.slug) ? "Saved to night plan" : "Save to night plan"}
            </button>
            <Link
              to="/record/$slug"
              params={{ slug: r.slug }}
              className="tap px-2 py-2.5 text-xs text-subtle underline underline-offset-4 hover:text-foreground"
            >
              Full dossier
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
