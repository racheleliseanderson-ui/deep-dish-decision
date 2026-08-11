import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { CaseFile } from "@/components/rih/case-file";
import { CompareDialog, CompareTray } from "@/components/rih/compare";
import { DecisionBrief } from "@/components/rih/decision-brief";
import { GiltRule, Marquee } from "@/components/rih/gilt";
import { RecordCard } from "@/components/rih/record-card";
import { SituationConsole } from "@/components/rih/situation-console";
import { SiteNav } from "@/components/rih/site-nav";
import heroPass from "@/assets/hero-pass.jpg";
import { dataset, records } from "@/lib/dataset";
import {
  OPS,
  emptySituation,
  filterRecords,
  rank,
  situationDepth,
  SITUATION_SLOTS,
  type Situation,
} from "@/lib/intelligence";
import { encodeSituation } from "@/lib/situation-url";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Restaurant Intelligence Hub — Situation-Aware Decision Instrument" },
      {
        name: "description",
        content:
          "First-party restaurant evidence, ranked against your actual situation. No star ratings, unknowns stay visible, fail-closed on stated constraints.",
      },
      { property: "og:title", content: "Restaurant Intelligence Hub" },
      {
        property: "og:description",
        content:
          "Describe the night — occasion, party, constraints, lead time — and read decision briefs built only from first-party evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Hub,
});

function Hub() {
  const [situation, setSituation] = useState<Situation>(emptySituation);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [limit, setLimit] = useState(8);

  const ranked = useMemo(
    () => rank(filterRecords(records, situation), situation),
    [situation],
  );
  const depth = situationDepth(situation);
  const lead = ranked[0] ?? null;
  const clear = ranked.filter((x) => !x.blocked && !x.criticals.length).length;
  const blocked = ranked.filter((x) => x.blocked).length;
  const openSc = ranked.find((x) => x.record.slug === openSlug) ?? null;
  const compared = compareSlugs
    .map((s) => ranked.find((x) => x.record.slug === s))
    .filter((x): x is NonNullable<typeof x> => !!x);

  // Ticker copy is counted from the corpus, never written by hand.
  const tickerItems = useMemo(
    () => [
      `${dataset.count} records under review`,
      `${dataset.regions} regions`,
      `${OPS.officialConflicts} official conflicts open`,
      `${OPS.avgUnknowns} mean unknowns per record`,
      `${OPS.overdue} reviews overdue`,
      "no sentiment scores",
      "fail-closed on stated constraints",
    ],
    [],
  );

  const packetHref = (slug: string) => {
    const q = encodeSituation(situation);
    return `/packet/${slug}${q ? `?${q}` : ""}`;
  };

  const toggleCompare = (slug: string) =>
    setCompareSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length >= 3 ? prev : [...prev, slug],
    );

  return (
    <main className="min-h-screen pb-32">
      {/* ---------------- Masthead ---------------- */}
      <header className="relative isolate overflow-hidden border-b border-border-strong">
        <img
          src={heroPass}
          alt="A single plate finished under brass lamplight on a marble pass"
          width={1920}
          height={1088}
          className="absolute inset-0 -z-10 size-full object-cover object-[62%_center] opacity-[0.42]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/92 to-background/30" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-background to-transparent" />

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
          <SiteNav />

          <div className="mt-10 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
            <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">001</span>
            <span className="text-eyebrow truncate">The window</span>
          </div>
          <GiltRule className="mt-3" />

          <h1 className="display-statement mt-7 max-w-[19ch]">
            A decision instrument,
            <br />
            <span className="text-gilt">not a ratings board.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Every line here is read from first-party sources — the restaurant&apos;s own site, menu,
            reservation page, or a direct call. Nothing is scored on sentiment. Where the evidence
            stops, the record says so and stays open. When a constraint you have stated cannot be
            satisfied on the record, the instrument fails closed and holds the booking.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Records under review" value={dataset.count} note={`${dataset.regions} regions`} />
            <Stat
              label="Official conflicts open"
              value={OPS.officialConflicts}
              note="Preserved, never collapsed"
              tone="critical"
            />
            <Stat
              label="Average unknowns per record"
              value={OPS.avgUnknowns}
              note="Held visible"
              tone="unknown"
            />
            <Stat
              label="Review overdue"
              value={OPS.overdue}
              note={`${OPS.dueSoon} due soon · last pass ${OPS.lastReviewAt}`}
              tone={OPS.overdue ? "watch" : "verified"}
            />
          </div>
        </div>
      </header>

      <Marquee items={tickerItems} />


      {/* ---------------- Situation ---------------- */}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <SituationConsole
          situation={situation}
          onChange={(next) => {
            setSituation(next);
            setLimit(8);
          }}
          inViewCount={ranked.length}
          totalCount={records.length}
        />

        {/* ---------------- Lead reading ---------------- */}
        {lead ? (
          <section className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Eyebrow>Lead reading</Eyebrow>
                <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
                  {lead.record.title}
                </h2>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {lead.record.region} · {lead.record.recordId} ·{" "}
                  {depth < 3
                    ? `situation ${depth}/${SITUATION_SLOTS} — this ordering is provisional`
                    : `situation ${depth}/${SITUATION_SLOTS}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="verified">{clear} clear on evidence</Chip>
                <Chip tone="critical">{blocked} held closed</Chip>
                <Chip tone="unknown">{ranked.length} in view</Chip>
              </div>
            </div>
            <div className="mt-5">
              <DecisionBrief sc={lead} situation={situation} />
            </div>
          </section>
        ) : null}

        {/* ---------------- Ranked records ---------------- */}
        <section className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Eyebrow>Ranked against your situation</Eyebrow>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                Order is a function of situation fit, confirm burden and time pressure. Records
                blocked on a stated constraint are demoted to the end rather than removed, so you
                can see what was excluded and why.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {ranked.slice(0, limit).map((sc) => (
              <RecordCard
                key={sc.record.slug}
                sc={sc}
                situation={situation}
                onOpen={() => setOpenSlug(sc.record.slug)}
                onCompare={() => toggleCompare(sc.record.slug)}
                compared={compareSlugs.includes(sc.record.slug)}
              />
            ))}
          </div>

          {!ranked.length ? (
            <p className="mt-6 rounded-xl border border-border bg-surface p-6 text-sm leading-relaxed text-muted-foreground">
              Nothing in the corpus matches those filters. The instrument will not widen your
              constraints to produce a result — loosen a filter above instead.
            </p>
          ) : null}

          {limit < ranked.length ? (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 8)}
              className="mt-6 w-full rounded-xl border border-border bg-surface py-3.5 text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Show {Math.min(8, ranked.length - limit)} more of {ranked.length}
            </button>
          ) : null}
        </section>

        <Rule className="my-14" />

        <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>Method</Eyebrow>
            <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight">
              What this instrument refuses to do.
            </h2>
            <ul className="mt-5 space-y-3.5 text-[13px] leading-relaxed text-muted-foreground">
              <li>
                <span className="text-foreground">No star ratings, no aggregate sentiment.</span> A
                room is not a score. Fit is situational and shown with the reasoning that produced
                it.
              </li>
              <li>
                <span className="text-foreground">No inference dressed as fact.</span> If the
                restaurant has not stated it, the field reads unstated and stays in the unknown
                layer.
              </li>
              <li>
                <span className="text-foreground">No conflict smoothing.</span> Where two official
                sources disagree, both remain on the record and the record carries a critical flag.
              </li>
              <li>
                <span className="text-foreground">Fail closed.</span> A stated allergy, access or
                private-room requirement that the record cannot satisfy holds the booking rather
                than downgrading to a hopeful maybe.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface-raised/40 p-5 sm:p-6">
            <Eyebrow>Corpus condition</Eyebrow>
            <dl className="mt-4 divide-y divide-border text-[13px]">
              {[
                ["Records", String(dataset.count)],
                ["Regions covered", String(dataset.regions)],
                ["Thin records", String(OPS.thinRecords)],
                ["Average thin fields", String(OPS.avgThinFields)],
                ["Reachable at last review", String(OPS.reachableAtLastReview)],
                ["Last review pass", OPS.lastReviewAt],
                ["Corpus generated", dataset.generatedAt],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-num">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[12px] leading-relaxed text-subtle">
              Hours, pricing and reservation policy are the most volatile fields in the corpus.
              Confirm them live before you commit, regardless of how complete a record looks.
            </p>
          </div>
        </section>
      </div>

      <CaseFile
        sc={openSc}
        situation={situation}
        onClose={() => setOpenSlug(null)}
        packetHref={packetHref}
      />
      <CompareTray
        items={compared}
        onRemove={(slug) => toggleCompare(slug)}
        onOpen={() => setCompareOpen(true)}
        onClear={() => setCompareSlugs([])}
      />
      <CompareDialog
        open={compareOpen && compared.length > 1}
        items={compared}
        situation={situation}
        onClose={() => setCompareOpen(false)}
      />
    </main>
  );
}
