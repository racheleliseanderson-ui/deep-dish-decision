import { Chip, Eyebrow } from "@/components/rih/bits";
import { ReturnToDesk } from "@/components/rih/return-to-desk";
import { decisionState, materialFindings, type DecisionState } from "@/components/rih/decision-card";
import { openLabel, spendLine, minutesToClock } from "@/lib/live";
import type { Finding, Scored, Situation } from "@/lib/intelligence";
import type { DecisionStatus } from "@/lib/salty-handoff/contract";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

type ConfirmStatus = "confirmed" | "cannot" | "unclear";
type ConfirmMap = Record<string, ConfirmStatus>;

const STATE_COPY: Record<DecisionState, { label: string; tone: "verified" | "watch" | "critical" }> = {
  good: { label: "GOOD FIT", tone: "verified" },
  verify: { label: "VERIFY FIRST", tone: "watch" },
  hold: { label: "HOLD", tone: "critical" },
};

function timeLabel(value: string | null) {
  if (!value) return "";
  const parts = value.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return minutesToClock(h * 60 + m);
}

function callScript(finding: Finding, sc: Scored, situation: Situation) {
  const room = sc.record.title;
  const time = timeLabel(situation.arriveAt);
  const when = situation.leadDays === 0 ? "tonight" : situation.leadDays !== null ? `in ${situation.leadDays} days` : "for an upcoming dinner";
  const at = time ? ` around ${time}` : "";
  const party = situation.partySize ? ` for ${situation.partySize}` : "";

  switch (finding.id) {
    case "diet-severe":
      return `Hi — we’re considering ${room} ${when}${at}${party}. One guest has a severe allergy or celiac disease. Can the kitchen currently accommodate that safely, including cross-contact?`;
    case "access-unstated":
    case "access-directory":
    case "access-stated":
      return `Hi — we’re considering ${room} ${when}${at}${party}. Could you confirm the step-free entrance route, accessible seating, and restroom access for the table we would book?`;
    case "noise":
      return `Hi — we’re considering ${room} ${when}${at}${party}. We need a table where conversation is comfortable. Is there a quieter section or earlier seating you would recommend?`;
    case "endtime":
      return `Hi — we’re considering ${room} ${when}${at}${party}. We have a hard end time. What table duration should we realistically allow, and can that timing be honored for this seating?`;
    case "party":
      return `Hi — we’re considering ${room} ${when}${at}${party}. Can you confirm the large-party booking path, including table configuration, deposit, set-menu rules, and cut-off date?`;
    case "private":
      return `Hi — we’re considering ${room} ${when}${at}${party}. Can you confirm whether a private or semi-private room is available, the minimum spend, and what is included?`;
    case "budget":
    case "budget-unknown":
    case "spend":
      return `Hi — we’re considering ${room} ${when}${at}${party}. What should we expect per guest after required service charges and supplements, before optional drinks?`;
    case "zero-proof":
      return `Hi — we’re considering ${room} ${when}${at}${party}. What zero-proof options are currently available, and is a non-alcoholic pairing offered for this menu?`;
    case "walkin":
      return `Hi — we’re considering ${room} ${when}${at}${party}. Do you take walk-ins for this service, and if so, when does the queue usually begin?`;
    case "lead-tight":
    case "lead-ok":
      return `Hi — we’re considering ${room} ${when}${at}${party}. Is there currently a realistic booking path for that arrival window?`;
    case "hours-unheld":
    case "hours-closing":
    case "hours-closed":
      return `Hi — we’re considering ${room} ${when}${at}${party}. Can you confirm the last seating and kitchen hours for our arrival time?`;
    default:
      return `Hi — we’re considering ${room} ${when}${at}${party}. Could you confirm this before we book: ${finding.title}?`;
  }
}

function sourceForFinding(finding: Finding, sc: Scored) {
  const r = sc.record;
  if (/diet|menu|zero-proof|beverage|spend/i.test(finding.domain)) {
    return r.menuUrl || r.officialSource || r.website;
  }
  if (/booking|party|timing|hours/i.test(finding.domain)) {
    return r.reservationUrl || r.officialSource || r.website;
  }
  return r.officialSource || r.website || r.reservationUrl || r.menuUrl;
}

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
      <div className="grid gap-3 sm:grid-cols-[52px_minmax(0,1fr)]">
        <span className="text-num text-xs tracking-[0.18em] text-gilt">{number}</span>
        <div>
          <h3 className="font-display text-2xl leading-tight tracking-tight">{title}</h3>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function DecisionWorkflow({
  sc,
  situation,
  onClose,
}: {
  sc: Scored | null;
  situation: Situation;
  onClose: () => void;
}) {
  const material = useMemo(() => (sc ? materialFindings(sc) : []), [sc]);
  const storageKey = sc
    ? `deep-dish-confirm:${sc.record.slug}:${situation.occasion ?? "any"}:${situation.constraints.join("|")}:${situation.leadDays ?? "na"}:${situation.arriveAt ?? "na"}`
    : "deep-dish-confirm:none";
  const [confirmed, setConfirmed] = useState<ConfirmMap>({});

  useEffect(() => {
    if (!sc) return;
    try {
      const raw = localStorage.getItem(storageKey);
      setConfirmed(raw ? (JSON.parse(raw) as ConfirmMap) : {});
    } catch {
      setConfirmed({});
    }
  }, [sc, storageKey]);

  useEffect(() => {
    if (!sc) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(confirmed));
    } catch {
      // Confirmation still works for the current session when storage is unavailable.
    }
  }, [confirmed, sc, storageKey]);

  useEffect(() => {
    if (!sc) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prior;
      window.removeEventListener("keydown", onKey);
    };
  }, [sc, onClose]);

  if (!sc) return null;

  const r = sc.record;
  const state = decisionState(sc);
  const stateCopy = STATE_COPY[state];
  const spend = spendLine(sc.live);
  const open = openLabel(sc.open, Boolean(situation.arriveAt));
  const hasCannot = material.some((f) => confirmed[f.id] === "cannot");
  const unresolved = material.filter((f) => confirmed[f.id] !== "confirmed");
  const allConfirmed = material.length === 0 || unresolved.length === 0;
  const readyToBook = state !== "hold" && !hasCannot && allConfirmed;
  const returnStatus: DecisionStatus = hasCannot || state === "hold" ? "hold" : readyToBook ? "verified" : "in-progress";

  const sources = [
    ["Restaurant website", r.officialSource || r.website],
    ["Menu", r.menuUrl],
    ["Reservations", r.reservationUrl],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  const uniqueSources = sources.filter((item, index) => sources.findIndex((other) => other[1] === item[1]) === index);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-ink/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Decision for ${r.title}`}>
      <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-background shadow-2xl">
        <header className="sticky top-0 z-10 rounded-t-3xl border-b border-border bg-background/95 px-5 py-4 backdrop-blur sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Eyebrow>Restaurant decision</Eyebrow>
                <Chip tone={stateCopy.tone}>{stateCopy.label}</Chip>
              </div>
              <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">{r.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{r.region}</p>
            </div>
            <button type="button" onClick={onClose} className="tap rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>
        </header>

        <div className="px-5 py-6 sm:px-7 sm:py-8">
          <Step number="01" title="FIT — why this works for your night">
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              {sc.reasons.slice(0, 5).map((reason) => (
                <li key={reason} className="flex gap-2"><span className="text-primary">✓</span><span>{reason}</span></li>
              ))}
              {sc.distanceMi !== null ? (
                <li className="flex gap-2"><span className="text-primary">✓</span><span>{Math.round(sc.distanceMi * 10) / 10} miles from {situation.originLabel ?? "your starting point"}</span></li>
              ) : null}
              {spend ? <li className="flex gap-2"><span className="text-primary">✓</span><span>{spend.text} · {spend.source}</span></li> : null}
              <li className="flex gap-2"><span className={open.tone === "critical" ? "text-critical" : "text-primary"}>✓</span><span>{open.text}</span></li>
            </ul>
          </Step>

          <Step number="02" title="UNKNOWNS — only what matters to this night">
            {material.length ? (
              <div className="space-y-3">
                {material.map((finding) => (
                  <div key={finding.id} className="rounded-xl border border-border bg-surface-sunken/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{finding.title}</p>
                      <Chip tone={finding.layer === "critical" ? "critical" : finding.layer === "watch" ? "watch" : "unknown"}>{finding.layer}</Chip>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground"><span className="text-foreground">What we know:</span> {finding.detail}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground"><span className="text-foreground">What we don’t know:</span> {finding.action}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">No material unknown is currently attached to the needs you gave Deep Dish. Volatile details still get a final live check before booking.</p>
            )}
          </Step>

          <Step number="03" title="OFFICIAL SOURCE — check the restaurant, not another directory">
            {uniqueSources.length ? (
              <div className="flex flex-wrap gap-2">
                {uniqueSources.map(([label, href]) => (
                  <a key={`${label}-${href}`} href={href} target="_blank" rel="noreferrer" className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
                    Open {label.toLowerCase()}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No official URL is held on this record. Use the phone path below.</p>
            )}
          </Step>

          <Step number="04" title="CONFIRM — get the remaining answer">
            {material.length ? (
              <div className="space-y-4">
                {material.map((finding) => {
                  const source = sourceForFinding(finding, sc);
                  const status = confirmed[finding.id];
                  return (
                    <div key={finding.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                      <p className="text-eyebrow">Ask this</p>
                      <p className="mt-2 text-sm leading-relaxed text-foreground">“{callScript(finding, sc, situation)}”</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {source ? (
                          <a href={source} target="_blank" rel="noreferrer" className="tap rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Check official source</a>
                        ) : null}
                        {r.hasPhone ? (
                          <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="tap rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Call {r.phone}</a>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2" aria-label={`Confirmation status for ${finding.title}`}>
                        <button type="button" onClick={() => setConfirmed((prev) => ({ ...prev, [finding.id]: "confirmed" }))} className={cn("tap rounded-full border px-3 py-2 text-xs", status === "confirmed" ? "border-verified bg-verified/10 text-verified" : "border-border text-muted-foreground")}>✓ Confirmed</button>
                        <button type="button" onClick={() => setConfirmed((prev) => ({ ...prev, [finding.id]: "cannot" }))} className={cn("tap rounded-full border px-3 py-2 text-xs", status === "cannot" ? "border-critical bg-critical/10 text-critical" : "border-border text-muted-foreground")}>✕ Cannot accommodate</button>
                        <button type="button" onClick={() => setConfirmed((prev) => ({ ...prev, [finding.id]: "unclear" }))} className={cn("tap rounded-full border px-3 py-2 text-xs", status === "unclear" ? "border-watch bg-watch/10 text-watch" : "border-border text-muted-foreground")}>? Still unclear</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing situation-specific is waiting on a call. Check current hours and reservation inventory, then move to booking.</p>
            )}
          </Step>

          <Step number="05" title="BOOK — only after the material questions are clear">
            {hasCannot ? (
              <div className="rounded-xl border border-critical/35 bg-critical/8 p-4 text-sm leading-relaxed text-critical">One of your hard requirements cannot be accommodated. Deep Dish is holding this restaurant rather than routing you into a booking.</div>
            ) : !readyToBook ? (
              <div className="rounded-xl border border-watch/35 bg-watch/8 p-4 text-sm leading-relaxed text-muted-foreground">{unresolved.length} confirmation{unresolved.length === 1 ? "" : "s"} still open. Finish those before booking.</div>
            ) : r.reservationUrl || r.website ? (
              <a href={r.reservationUrl || r.website} target="_blank" rel="noreferrer" className="tap inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">Book through the restaurant</a>
            ) : r.hasPhone ? (
              <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="tap inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">Call to book · {r.phone}</a>
            ) : (
              <p className="text-sm text-muted-foreground">No live booking path is held. Return this as unresolved rather than guessing.</p>
            )}
          </Step>

          <Step number="06" title="RETURN — keep the decision with the night">
            <ReturnToDesk
              room={r.title}
              status={returnStatus}
              unresolved={unresolved.map((finding) => callScript(finding, sc, situation))}
            />
          </Step>
        </div>
      </div>
    </div>
  );
}
