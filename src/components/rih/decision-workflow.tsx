import { Chip, Eyebrow } from "@/components/rih/bits";
import { decisionState, materialFindings } from "@/components/rih/decision-card";
import { SendToNightPlan } from "@/components/rih/send-to-night-plan";
import {
  confirmationSummary,
  readConfirmationEvidence,
  setConfirmationDetail,
  updateConfirmationEvidence,
  writeConfirmationEvidence,
  type ConfirmationMap,
  type ConfirmationMethod,
  type ConfirmationStatus,
  type DecisionState,
} from "@/lib/confirmation-evidence";
import { openLabel, spendLine, minutesToClock } from "@/lib/live";
import { firstPartyMenuUrl, readMenuLink } from "@/lib/menu-link";
import type { Finding, Scored, Situation } from "@/lib/intelligence";
import type { NightDetails } from "@/lib/night-context";
import type { DecisionStatus } from "@/lib/salty-handoff/contract";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STATE_COPY: Record<DecisionState, { label: string; tone: "verified" | "watch" | "critical" }> = {
  good: { label: "GOOD FIT", tone: "verified" },
  verify: { label: "VERIFY FIRST", tone: "watch" },
  hold: { label: "HOLD", tone: "critical" },
};

const METHOD_LABELS: { value: ConfirmationMethod; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
];

function timeLabel(value: string | null) {
  if (!value) return "";
  const parts = value.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return minutesToClock(h * 60 + m);
}

function checkedLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function callScript(finding: Finding, sc: Scored, situation: Situation, details: NightDetails) {
  const room = sc.record.title;
  const time = timeLabel(situation.arriveAt);
  const hardOut = timeLabel(details.hardEndAt);
  const when =
    situation.leadDays === 0
      ? "tonight"
      : situation.leadDays !== null
        ? `in ${situation.leadDays} days`
        : "for an upcoming dinner";
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
      return hardOut
        ? `Hi — we’re considering ${room} ${when}${at}${party}. We need to be completely finished by ${hardOut}. What table duration should we realistically allow, and can that end time be honored for this seating?`
        : `Hi — we’re considering ${room} ${when}${at}${party}. We have a hard end time. What table duration should we realistically allow, and can that timing be honored for this seating?`;
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
    // A confirmation source has to be a page the restaurant wrote. A review of
    // it answers nothing a caller can act on.
    return firstPartyMenuUrl(r.menuUrl, r.website) || r.officialSource || r.website;
  }
  if (/booking|party|timing|hours/i.test(finding.domain)) {
    return r.reservationUrl || r.officialSource || r.website;
  }
  return (
    r.officialSource || r.website || r.reservationUrl || firstPartyMenuUrl(r.menuUrl, r.website)
  );
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

function SourceLinks({ sc }: { sc: Scored }) {
  const r = sc.record;
  // The word "Menu" is a claim about who wrote the page. It is only used when
  // the link is on the restaurant's own domain or on an ordering platform it
  // controls; anything else is named by its host, and a publisher writing about
  // the restaurant is filed as coverage rather than offered as a menu.
  const menu = readMenuLink(r.menuUrl, r.website);
  const sources: [string, string][] = [
    ["Restaurant website", r.officialSource || r.website],
    ...(menu ? ([[menu.label, menu.url]] as [string, string][]) : []),
    ["Reservations", r.reservationUrl],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const unique = sources.filter(
    (item, index) => sources.findIndex((other) => other[1] === item[1]) === index,
  );

  if (!unique.length) {
    return <p className="text-sm text-muted-foreground">No official link is saved for this restaurant. Use the phone path if one is available.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {unique.map(([label, href]) => (
          <a
            key={`${label}-${href}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            {label === "Restaurant website" || label === "Reservations"
              ? `Open ${label.toLowerCase()}`
              : label}
          </a>
        ))}
      </div>
      {menu && !menu.isMenu ? (
        <p className="mt-2 text-[12px] leading-relaxed text-unknown">
          {menu.kind === "press"
            ? `No menu is on file for this room. The link above is ${menu.host} writing about it, kept as coverage.`
            : `No menu on the restaurant's own domain is on file. The link above goes to ${menu.host}, which Deep Dish cannot confirm the restaurant controls.`}
        </p>
      ) : null}
    </>
  );
}

function ConfirmationCard({
  finding,
  sc,
  situation,
  details,
  evidence,
  onStatus,
  onMethod,
  onNote,
}: {
  finding: Finding;
  sc: Scored;
  situation: Situation;
  details: NightDetails;
  evidence: ConfirmationMap[string] | undefined;
  onStatus: (status: ConfirmationStatus) => void;
  onMethod: (method: ConfirmationMethod) => void;
  onNote: (note: string) => void;
}) {
  const source = sourceForFinding(finding, sc);
  const checked = checkedLabel(evidence?.checkedAt ?? null);
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-foreground">{finding.title}</p>
        {evidence?.status ? (
          <Chip tone={evidence.status === "confirmed" ? "verified" : evidence.status === "cannot" ? "critical" : "watch"}>
            {evidence.status === "confirmed" ? "Confirmed" : evidence.status === "cannot" ? "Cannot accommodate" : "Still unclear"}
          </Chip>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">What we know:</span> {finding.detail}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">Ask this:</span> “{callScript(finding, sc, situation, details)}”
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {source ? (
          <a href={source} target="_blank" rel="noreferrer" className="tap rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            Check official source
          </a>
        ) : null}
        {sc.record.hasPhone ? (
          <a href={`tel:${sc.record.phone.replace(/[^\d+]/g, "")}`} className="tap rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
            Call {sc.record.phone}
          </a>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label={`Confirmation status for ${finding.title}`}>
        <button type="button" onClick={() => onStatus("confirmed")} className={cn("tap rounded-full border px-3 py-2 text-xs", evidence?.status === "confirmed" ? "border-verified bg-verified/10 text-verified" : "border-border text-muted-foreground")}>✓ Confirmed</button>
        <button type="button" onClick={() => onStatus("cannot")} className={cn("tap rounded-full border px-3 py-2 text-xs", evidence?.status === "cannot" ? "border-critical bg-critical/10 text-critical" : "border-border text-muted-foreground")}>✕ Cannot accommodate</button>
        <button type="button" onClick={() => onStatus("unclear")} className={cn("tap rounded-full border px-3 py-2 text-xs", evidence?.status === "unclear" ? "border-watch bg-watch/10 text-watch" : "border-border text-muted-foreground")}>? Still unclear</button>
      </div>

      {evidence ? (
        <div className="mt-4 rounded-xl bg-surface-sunken/45 p-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">How did you check?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {METHOD_LABELS.map((method) => (
              <button
                key={method.value}
                type="button"
                onClick={() => onMethod(method.value)}
                className={cn(
                  "tap rounded-full border px-2.5 py-1.5 text-xs",
                  evidence.method === method.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {method.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="text-[11px] uppercase tracking-[0.12em] text-subtle">Optional note</span>
            <input
              type="text"
              maxLength={180}
              value={evidence.note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="e.g. host confirmed the 7:00 table can be quiet"
              className="mt-1.5 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-foreground placeholder:text-subtle"
            />
          </label>
          {checked ? <p className="mt-2 text-[11px] text-subtle">Checked {checked}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function BookingAction({ sc, state }: { sc: Scored; state: DecisionState }) {
  const r = sc.record;
  if (state === "hold") {
    return <p className="text-sm leading-relaxed text-critical">This restaurant is on hold. Do not book it against the night as currently defined.</p>;
  }
  if (state === "verify") {
    return <p className="text-sm leading-relaxed text-muted-foreground">One or more important answers are still open. Finish those before booking.</p>;
  }
  if (r.reservationUrl || r.website) {
    return (
      <a href={r.reservationUrl || r.website} target="_blank" rel="noreferrer" className="tap inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
        Book through the restaurant
      </a>
    );
  }
  if (r.hasPhone) {
    return (
      <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="tap inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
        Call to book · {r.phone}
      </a>
    );
  }
  return <p className="text-sm text-muted-foreground">No live booking path is saved. Keep this decision open rather than guessing.</p>;
}

export function DecisionWorkflow({
  sc,
  situation,
  details,
  onClose,
  onNextBest,
}: {
  sc: Scored | null;
  situation: Situation;
  details: NightDetails;
  onClose: () => void;
  onNextBest?: (() => void) | undefined;
}) {
  const material = useMemo(() => (sc ? materialFindings(sc) : []), [sc]);
  const [evidence, setEvidence] = useState<ConfirmationMap>({});

  useEffect(() => {
    if (!sc) return;
    setEvidence(readConfirmationEvidence(sc.record.slug, situation, details));
  }, [sc, situation, details]);

  const dialogRef = useRef<HTMLDivElement | null>(null);

  const focusableIn = useCallback((root: HTMLElement): HTMLElement[] => {
    const nodes = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    return Array.from(nodes).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
  }, []);

  /**
   * aria-modal="true" is a promise to assistive tech that the rest of the page
   * is inert. Escape and the scroll lock were already here; focus was not, so
   * a keyboard reader tabbed straight out of the dialog into the page behind it
   * and had no way back. Move focus in on open, cycle it at the ends, and give
   * it back to whatever opened the dialog on close.
   */
  useEffect(() => {
    if (!sc) return;
    const prior = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const root = dialogRef.current;
    if (root) {
      const first = focusableIn(root)[0];
      (first ?? root).focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const items = focusableIn(container);
      if (!items.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prior;
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [sc, onClose, focusableIn]);

  if (!sc) return null;

  const r = sc.record;
  const baseState = decisionState(sc);
  const summary = confirmationSummary(baseState, material, evidence);
  const effectiveState = summary.state;
  const stateCopy = STATE_COPY[effectiveState];
  const spend = spendLine(sc.live);
  const open = openLabel(sc.open, Boolean(situation.arriveAt));
  const returnStatus: DecisionStatus =
    effectiveState === "hold" ? "hold" : effectiveState === "good" ? "verified" : "in-progress";

  const saveEvidence = (next: ConfirmationMap) => {
    setEvidence(next);
    writeConfirmationEvidence(r.slug, situation, details, next);
  };

  const setStatus = (finding: Finding, status: ConfirmationStatus) => {
    saveEvidence(updateConfirmationEvidence(evidence, finding.id, { status }));
  };

  const setMethod = (finding: Finding, method: ConfirmationMethod) => {
    saveEvidence(setConfirmationDetail(evidence, finding.id, { method }));
  };

  const setNote = (finding: Finding, note: string) => {
    saveEvidence(setConfirmationDetail(evidence, finding.id, { note }));
  };

  const fitContent = (
    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      {sc.reasons.slice(0, 4).map((reason) => (
        <li key={reason} className="flex gap-2"><span className="text-primary">✓</span><span>{reason}</span></li>
      ))}
      {sc.distanceRead ? (
        <li className="flex gap-2">
          <span className={sc.distanceRead.exact ? "text-primary" : "text-unknown"}>
            {sc.distanceRead.exact ? "✓" : "~"}
          </span>
          <span>
            {sc.distanceRead.exact
              ? `${sc.distanceRead.value} from ${situation.originLabel ?? "your starting point"}`
              : `${sc.distanceRead.value} ${sc.distanceRead.measuredTo}. No address coordinate is on file, so this is not the distance to the door.`}
          </span>
        </li>
      ) : null}
      {spend ? <li className="flex gap-2"><span className="text-primary">✓</span><span>{spend.text} · {spend.source}</span></li> : null}
      <li className="flex gap-2"><span className={open.tone === "critical" ? "text-critical" : "text-primary"}>✓</span><span>{open.text}</span></li>
    </ul>
  );

  const confirmedRecap = summary.confirmed.length ? (
    <div className="space-y-2">
      {summary.confirmed.map((finding) => {
        const item = evidence[finding.id];
        const checked = checkedLabel(item?.checkedAt ?? null);
        return (
          <div key={finding.id} className="rounded-xl border border-verified/25 bg-verified/5 p-3 text-[13px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">✓ {finding.title}</p>
            <p className="mt-1">
              Confirmed{item?.method ? ` by ${item.method}` : ""}{checked ? ` · ${checked}` : ""}{item?.note ? ` · ${item.note}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  ) : null;

  const confirmationCards = (findings: Finding[]) => (
    <div className="space-y-4">
      {findings.map((finding) => (
        <ConfirmationCard
          key={finding.id}
          finding={finding}
          sc={sc}
          situation={situation}
          details={details}
          evidence={evidence[finding.id]}
          onStatus={(status) => setStatus(finding, status)}
          onMethod={(method) => setMethod(finding, method)}
          onNote={(note) => setNote(finding, note)}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] overflow-y-auto bg-ink/80 p-3 backdrop-blur-sm outline-none sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Decision for ${r.title}`}
    >
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
          {effectiveState === "hold" ? (
            <>
              <section className="rounded-2xl border border-critical/35 bg-critical/8 p-5 sm:p-6">
                <p className="text-eyebrow text-critical">Hold this one</p>
                <h3 className="mt-2 font-display text-2xl leading-tight">Something important does not clear the night yet.</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  A hard requirement is either unsupported or has been confirmed as unavailable. Resolve it only if the restaurant gives you a different live answer; otherwise move on.
                </p>
                {onNextBest ? (
                  <button type="button" onClick={onNextBest} className="tap mt-4 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                    Show me the next best option
                  </button>
                ) : null}
              </section>

              <Step number="01" title="What is blocking it">
                {confirmationCards([
                  ...summary.cannot,
                  ...summary.unanswered.filter((finding) => finding.layer === "critical"),
                  ...summary.unclear.filter((finding) => finding.layer === "critical"),
                ].filter((finding, index, all) => all.findIndex((item) => item.id === finding.id) === index))}
              </Step>

              {confirmedRecap ? <Step number="02" title="Already confirmed">{confirmedRecap}</Step> : null}

              <Step number="03" title="Keep the decision with the night">
                <SendToNightPlan
                  room={r.title}
                  status={returnStatus}
                  // The script text stays on this screen. Only the category travels.
                  unresolved={summary.unresolved}
                />
              </Step>
            </>
          ) : effectiveState === "good" ? (
            <>
              <Step number="01" title="Why it works">{fitContent}</Step>
              <Step number="02" title="Quick live check">
                <div className="space-y-4">
                  {confirmedRecap}
                  <SourceLinks sc={sc} />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Check current hours and reservation inventory before committing. Deep Dish is not treating a stale opening or old menu as a live guarantee.
                  </p>
                </div>
              </Step>
              <Step number="03" title="Book"><BookingAction sc={sc} state={effectiveState} /></Step>
              <Step number="04" title="Keep the decision with the night">
                <SendToNightPlan room={r.title} status={returnStatus} unresolved={[]} />
              </Step>
            </>
          ) : (
            <>
              <Step number="01" title="Why it works">{fitContent}</Step>
              <Step number="02" title="What still needs an answer">
                <div className="space-y-4">
                  {confirmedRecap}
                  {summary.unresolved.length ? (
                    <div className="space-y-3">
                      {summary.unresolved.map((finding) => (
                        <div key={finding.id} className="rounded-xl border border-border bg-surface-sunken/40 p-4">
                          <p className="font-medium text-foreground">{finding.title}</p>
                          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{finding.detail}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Step>
              <Step number="03" title="Check the restaurant"><SourceLinks sc={sc} /></Step>
              <Step number="04" title="Confirm it">{confirmationCards(summary.unresolved)}</Step>
              <Step number="05" title="Book"><BookingAction sc={sc} state={effectiveState} /></Step>
              <Step number="06" title="Keep the decision with the night">
                <SendToNightPlan
                  room={r.title}
                  status={returnStatus}
                  // The script text stays on this screen. Only the category travels.
                  unresolved={summary.unresolved}
                />
              </Step>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
