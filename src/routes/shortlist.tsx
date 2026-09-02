import { Chip, Eyebrow } from "@/components/rih/bits";
import { decisionState, materialFindings } from "@/components/rih/decision-card";
import { DecisionWorkflow } from "@/components/rih/decision-workflow";
import {
  CONFIRMATION_EVENT,
  confirmationSummary,
  readConfirmationEvidence,
  type ConfirmationMap,
  type DecisionState,
} from "@/lib/confirmation-evidence";
import { emptySituation, scoreRecord, type Scored, type Situation } from "@/lib/intelligence";
import { openLabel, spendLine } from "@/lib/live";
import {
  clearNightContext,
  emptyNightDetails,
  readNightContext,
  type NightDetails,
  type StoredNightContext,
} from "@/lib/night-context";
import { useEnrichmentSignals } from "@/lib/prefs";
import { useShortlist } from "@/lib/shortlist";
import { useRecordsBySlug } from "@/hooks/use-records-by-slug";
import { useLiveRows, useMinuteClock } from "@/hooks/use-live-rows";
import { decodeSituation } from "@/lib/situation-url";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

const STATE_COPY: Record<DecisionState, { label: string; tone: "verified" | "watch" | "critical" }> = {
  good: { label: "GOOD FIT", tone: "verified" },
  verify: { label: "VERIFY FIRST", tone: "watch" },
  hold: { label: "HOLD", tone: "critical" },
};

const CONSTRAINT_LABELS: Record<string, string> = {
  "Severe allergy / celiac": "Allergy / celiac",
  "Mobility / step-free needs": "Accessibility",
  "Hearing / noise sensitivity": "Need quiet",
  "Hard end time (show, train, childcare)": "Hard end time",
  "Large party (6+)": "Large group",
  "Hard budget cap": "Hard budget",
  "Private / semi-private required": "Private room",
  "Zero-proof / no alcohol": "Zero-proof",
};

export const Route = createFileRoute("/shortlist")({
  head: () => ({
    meta: [
      { title: "Night Plan — your restaurant decision" },
      {
        name: "description",
        content:
          "Keep the restaurant you are leaning toward, your backup choices, what has been confirmed, what remains, and the booking path in one place.",
      },
      { property: "og:title", content: "Night Plan — keep the restaurant decision together" },
      {
        property: "og:description",
        content:
          "Your first choice, backup choices, confirmations, remaining questions, and booking path.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Shortlist,
});

function dateLabel(leadDays: number | null) {
  if (leadDays === null) return "Date not set";
  if (leadDays === 0) return "Tonight";
  const date = new Date();
  date.setDate(date.getDate() + leadDays);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(value: string | null) {
  if (!value) return "Time flexible";
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function checkedLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function NightDecisionCard({
  sc,
  situation,
  details,
  index,
  onOpen,
  onMakePrimary,
  onRemove,
}: {
  sc: Scored;
  situation: Situation;
  details: NightDetails;
  index: number;
  onOpen: () => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const [evidence, setEvidence] = useState<ConfirmationMap>({});
  const material = materialFindings(sc);

  useEffect(() => {
    const sync = () => setEvidence(readConfirmationEvidence(sc.record.slug, situation, details));
    sync();
    window.addEventListener(CONFIRMATION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONFIRMATION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sc.record.slug, situation, details]);

  const summary = confirmationSummary(decisionState(sc), material, evidence);
  const stateCopy = STATE_COPY[summary.state];
  const open = openLabel(sc.open, Boolean(situation.arriveAt));
  const spend = spendLine(sc.live);
  const why = sc.reasons[0] ?? sc.record.serviceSummary;

  return (
    <article className={index === 0 ? "rounded-2xl border border-primary/35 bg-surface p-5 shadow-lift sm:p-6" : "rounded-2xl border border-border bg-surface p-5 sm:p-6"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-eyebrow text-gilt">{index === 0 ? "Chosen restaurant" : `Backup choice ${index}`}</p>
          <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight sm:text-3xl">{sc.record.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{sc.record.region}</p>
        </div>
        <Chip tone={stateCopy.tone}>{stateCopy.label}</Chip>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">Why it fits:</span> {why}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border px-3 py-1.5">{open.text}</span>
        {spend ? <span className="rounded-full border border-border px-3 py-1.5">{spend.text}</span> : null}
        {sc.distanceMi !== null ? <span className="rounded-full border border-border px-3 py-1.5">{Math.round(sc.distanceMi * 10) / 10} mi away</span> : null}
      </div>

      {summary.confirmed.length ? (
        <div className="mt-5 rounded-xl border border-verified/25 bg-verified/5 p-4">
          <p className="text-eyebrow text-verified">Confirmed</p>
          <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
            {summary.confirmed.map((finding) => {
              const item = evidence[finding.id];
              const checked = checkedLabel(item?.checkedAt ?? null);
              return (
                <li key={finding.id}>
                  <span className="font-medium text-foreground">✓ {finding.title}</span>
                  {item?.method || checked || item?.note ? (
                    <span className="block text-xs text-subtle">
                      {[item?.method ? `via ${item.method}` : null, checked, item?.note || null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {summary.cannot.length ? (
        <div className="mt-5 rounded-xl border border-critical/30 bg-critical/7 p-4">
          <p className="text-eyebrow text-critical">Cannot accommodate</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
            {summary.cannot.map((finding) => <li key={finding.id}>✕ {finding.title}</li>)}
          </ul>
        </div>
      ) : null}

      {summary.unresolved.length ? (
        <div className="mt-5 rounded-xl border border-watch/30 bg-watch/7 p-4">
          <p className="text-eyebrow text-watch">Still to confirm</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
            {summary.unresolved.slice(0, 4).map((finding) => <li key={finding.id}>• {finding.title}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onOpen} className="tap rounded-full bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground">
          {summary.state === "good" ? "Review and book" : summary.state === "hold" ? "Review the blocker" : "Continue the decision"}
        </button>
        {summary.state === "good" && (sc.record.reservationUrl || sc.record.website) ? (
          <a href={sc.record.reservationUrl || sc.record.website} target="_blank" rel="noreferrer" className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">
            Book
          </a>
        ) : null}
        {index > 0 ? (
          <button type="button" onClick={onMakePrimary} className="tap rounded-full border border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground">
            Use as first choice
          </button>
        ) : null}
        <button type="button" onClick={onRemove} className="tap px-2 py-2.5 text-xs text-subtle hover:text-critical">
          Remove
        </button>
      </div>
    </article>
  );
}

function Shortlist() {
  const shortlist = useShortlist();
  const enrichment = useEnrichmentSignals();
  const search = useRouterState({ select: (st) => st.location.searchStr });
  const urlSituation = useMemo(() => (search ? decodeSituation(search) : null), [search]);
  const [stored, setStored] = useState<StoredNightContext>({
    situation: { ...emptySituation },
    details: { ...emptyNightDetails },
  });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const now = useMinuteClock();

  useEffect(() => {
    setStored(readNightContext());
  }, []);

  const situation = urlSituation ?? stored.situation;
  const details = stored.details;
  const { records } = useRecordsBySlug(shortlist.slugs);
  const { rows: live } = useLiveRows(records);

  const rows = records.map((record) => ({
    record,
    sc: scoreRecord(record, situation, {
      useEnrichment: enrichment.enabled,
      live,
      now,
    }),
  }));

  const selected = selectedSlug
    ? rows.find((row) => row.record.slug === selectedSlug)?.sc ?? null
    : null;

  const nextBest = () => {
    const current = selectedSlug ? rows.findIndex((row) => row.record.slug === selectedSlug) : -1;
    const next = rows[current + 1] ?? rows[0];
    setSelectedSlug(next?.record.slug ?? null);
  };

  const area = situation.region ?? situation.originLabel ?? "Area not set";
  const night = situation.occasion ?? "Any kind of night";
  const constraints = situation.constraints.map((value) => CONSTRAINT_LABELS[value] ?? value);

  return (
    <main className="min-h-screen pb-28">
      <header className="border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-5xl px-4 pb-9 pt-8 sm:px-6">
          <p className="text-eyebrow text-gilt">Night Plan</p>
          <h1 className="mt-3 max-w-3xl font-display text-[2.3rem] font-normal leading-[1.02] tracking-[-0.02em] sm:text-5xl">
            Keep the restaurant decision together.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Your first choice, backups, live confirmations, and the booking path stay here in this browser.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <Eyebrow>{situation.leadDays === 0 ? "Tonight" : "This night"}</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-border px-3 py-1.5">{area}</span>
            <span className="rounded-full border border-border px-3 py-1.5">{night}</span>
            <span className="rounded-full border border-border px-3 py-1.5">{dateLabel(situation.leadDays)}</span>
            <span className="rounded-full border border-border px-3 py-1.5">{timeLabel(situation.arriveAt)}</span>
            {details.hardEndAt ? <span className="rounded-full border border-border px-3 py-1.5">Done by {timeLabel(details.hardEndAt)}</span> : null}
            {situation.partySize ? <span className="rounded-full border border-border px-3 py-1.5">{situation.partySize} people</span> : null}
            {situation.spendBand ? <span className="rounded-full border border-border px-3 py-1.5">Budget {situation.spendBand}</span> : null}
          </div>
          {constraints.length ? (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">Cannot go wrong:</span> {constraints.join(" · ")}
            </p>
          ) : null}
          <Link to="/" hash="situation" className="mt-4 inline-block text-xs text-primary underline underline-offset-4">
            Change the night
          </Link>
        </section>

        {!rows.length ? (
          <div className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center">
            <h2 className="font-display text-2xl">No restaurant saved yet.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Find restaurants for the night, then save the ones you would actually consider.
            </p>
            <Link to="/" hash="ranked" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground">
              Find a restaurant
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-10 space-y-5">
              {rows.map(({ record, sc }, index) => (
                <NightDecisionCard
                  key={record.slug}
                  sc={sc}
                  situation={situation}
                  details={details}
                  index={index}
                  onOpen={() => setSelectedSlug(record.slug)}
                  onMakePrimary={() => shortlist.makePrimary(record.slug)}
                  onRemove={() => shortlist.remove(record.slug)}
                />
              ))}
            </div>

            <div className="mt-8 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => {
                  shortlist.clear();
                  clearNightContext();
                  setStored({ situation: { ...emptySituation }, details: { ...emptyNightDetails } });
                }}
                className="tap text-xs text-muted-foreground underline underline-offset-4 hover:text-critical"
              >
                Clear this night
              </button>
            </div>
          </>
        )}
      </div>

      <DecisionWorkflow
        sc={selected}
        situation={situation}
        details={details}
        onClose={() => setSelectedSlug(null)}
        onNextBest={nextBest}
      />
    </main>
  );
}
