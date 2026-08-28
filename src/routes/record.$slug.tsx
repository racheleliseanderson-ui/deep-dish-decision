import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { canonical } from "@/lib/seo";
import { useState } from "react";
import { Button, Eyebrow, LayerBadge } from "@/components/ui";
import { bySlug } from "@/data/restaurants";
import { createPass } from "@/lib/confirm";
import { decisionBrief, scoreRecord } from "@/lib/intelligence";
import { correctionsFor, saveCorrection, track } from "@/lib/storage";
import { useNight } from "@/lib/store";
import { emptySituation } from "@/lib/types";
import { formatHumanDate } from "@/lib/utils";

export const Route = createFileRoute("/record/$slug")({
  component: RecordPage,
  head: ({ params }) => {
    const record = bySlug.get(params.slug);
    return {
      meta: [
        { title: record ? `${record.title} — Deep Dish` : "Restaurant file — Deep Dish" },
        {
          name: "description",
          content: record
            ? `First-party evidence for ${record.title}: hours, cancellation, access, dietary handling, and what is still unstated.`
            : "What this restaurant has actually published, and what it has not.",
        },
      ],
      links: [canonical(`/record/${params.slug}`)],
    };
  },
});

function RecordPage() {
  const { slug } = Route.useParams();
  const record = bySlug.get(slug);
  if (!record) throw notFound();
  const store = useNight();
  const situation = store.hydrated ? store.situation() : emptySituation;
  const sc = scoreRecord(record, situation);
  const brief = decisionBrief(sc, situation);

  const startPass = () => {
    const nightId = store.activeId ?? store.startNight(situation).id;
    const existing = store.passes.find((p) => p.slug === slug && p.nightId === nightId);
    if (existing) return existing.id;
    const pass = createPass(record, situation, sc, nightId);
    store.savePass(pass);
    track("confirm_started", { slug });
    return pass.id;
  };

  const rows: [string, string, string][] = [
    ["Service", record.serviceSummary, "current"],
    ["Hours", record.hoursSummary, record.hoursFreshness],
    ["Reservations", record.reservationDetails, "current"],
    ["Cancellation", record.cancellationPolicy, record.cancellationFreshness],
    ["Deposit", record.depositPolicy, record.cancellationFreshness],
    ["Late policy", record.latePolicy, "incomplete"],
    ["Price", record.priceDetails, record.priceFreshness],
    ["Dietary", record.dietaryDetails, record.dietaryFreshness],
    ["Access", record.accessibilityState, record.accessFreshness],
    ["Beverage", record.beverageDetails, "incomplete"],
    ["Groups", record.groupDetails, "incomplete"],
    ["Atmosphere", record.atmosphereSummary, "current"],
    ["Parking / transit", record.parkingTransit, "unknown"],
    ["Dress", record.dressCode, "unknown"],
    ["Meal length", record.typicalMealLength, "current"],
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-eyebrow">{record.region}</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">{record.title}</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">{record.cuisineContext}</p>
      <p className="mt-2 text-[13px] text-subtle">
        {record.address} · {record.phone}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/confirm/$slug" params={{ slug }} onClick={startPass}>
            Start confirmation pass
          </Link>
        </Button>
        {record.website ? (
          <Button asChild variant="outline">
            <a href={record.website} target="_blank" rel="noreferrer">
              Official site
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        ) : null}
        {record.hasPhone ? (
          <Button asChild variant="outline">
            <a href={`tel:${record.phone.replace(/[^\d+]/g, "")}`}>Call {record.phone}</a>
          </Button>
        ) : null}
      </div>

      <section className="plate mt-8 p-5">
        <Eyebrow>Against this night</Eyebrow>
        <p className="mt-2 font-display text-2xl">{brief.verdict}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">{brief.fitLine}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">{brief.nextAction}</p>
        <ul className="mt-4 space-y-2">
          {sc.findings.slice(0, 8).map((f) => (
            <li key={f.id} className="text-[13px]">
              <LayerBadge layer={f.layer} />{" "}
              <span className="font-medium">{f.title}.</span>{" "}
              <span className="text-muted-foreground">{f.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <Eyebrow>First-party evidence</Eyebrow>
        <h2 className="mt-1 font-display text-2xl">The record as published</h2>
        <dl className="mt-4 divide-y divide-border">
          {rows.map(([k, v, fresh]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[140px_1fr]">
              <dt className="text-[12px] uppercase tracking-[0.12em] text-subtle">
                {k}{" "}
                <span className="ml-1 normal-case tracking-normal">
                  <LayerBadge layer={fresh as never} />
                </span>
              </dt>
              <dd className="text-[14px] leading-relaxed text-muted-foreground">{v || "Not stated."}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10">
        <Eyebrow>Still unanswered</Eyebrow>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-muted-foreground">
          {record.unknownList.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <Eyebrow>Sources</Eyebrow>
        <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
          {record.sources.map((s) => (
            <li key={s} className="break-all">
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-subtle">
          {record.sourceAuthority} · checked {record.retrievedAt} · next review {record.nextReviewAt} ·{" "}
          {record.disclaimer}
        </p>
        <ReportForm slug={slug} />
      </section>
    </main>
  );
}

function ReportForm({ slug }: { slug: string }) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(() => correctionsFor(slug));
  return (
    <form
      className="mt-6 rounded-2xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!note.trim()) return;
        setSaved(saveCorrection(slug, note.trim()));
        setNote("");
        setSent(true);
      }}
    >
      <p className="text-[13px] font-medium">Something wrong on this file?</p>
      <p className="mt-1 text-[12px] text-subtle">
        Stays on this device. Include the field and what you confirmed live. No name required.
      </p>
      <label className="mt-3 block">
        <span className="sr-only">Correction note</span>
        <textarea
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-20 w-full rounded-xl border border-input bg-surface px-3 py-2 text-base text-foreground"
          placeholder="e.g. Cancellation is 24h / $25 as of tonight's call."
        />
      </label>
      <button type="submit" className="tap mt-3 inline-flex items-center text-sm text-primary underline underline-offset-2">
        {sent ? "Noted on this device" : "Save a correction note"}
      </button>
      {saved.length ? (
        <ul className="mt-4 space-y-2 border-t border-border pt-3">
          {saved.map((n) => (
            <li key={n.id} className="text-[12px] text-muted-foreground">
              <span className="text-subtle">{formatHumanDate(n.at.slice(0, 10))} · </span>
              {n.note}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
