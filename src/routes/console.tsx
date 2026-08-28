import { Chip, Eyebrow, Rule, Stat } from "@/components/rih/bits";
import { RunPlanner } from "@/components/rih/run-planner";
import { GrowBar, Reveal } from "@/components/rih/reveal";
import { SiteNav } from "@/components/rih/site-nav";
import coverage from "@/data/coverage.json";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "Coverage Console — Restaurant Intelligence Hub" },
      {
        name: "description",
        content:
          "Coverage of the restaurant files: records by state, how complete each file is, recent first-party reads, and the cities still queued.",
      },
      { property: "og:title", content: "Coverage Console — where the corpus is thin" },
      {
        property: "og:description",
        content:
          "State-by-state coverage, completeness distribution, recent additions and the controlled expansion queue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Console,
});

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") : "—";

function scoreTone(score: number) {
  if (score >= 85) return "verified" as const;
  if (score >= 70) return "primary" as const;
  if (score >= 50) return "watch" as const;
  return "critical" as const;
}

type LedgerFilter = "all" | "hygiene" | "stale" | "thin" | "site" | "review";

function Console() {
  const { totals, states, distribution, records, recent, queue, runs, outsideUs, generatedAt, freshness } =
    coverage as Omit<typeof coverage, "queue"> & {
      queue: {
        paused: boolean;
        restaurantsPerRun: number;
        citiesPerRun: number;
        dailyCap: number;
        pending: number;
        done: number;
        next: Array<{
          city: string;
          stateCode: string;
          priority: number;
          tier: string;
        }>;
      };
      freshness?: {
        tiers: { A: number; B: number; C: number };
        preferRefreshOverDiscover: boolean;
        hygieneBatchSize: number;
        hygieneSlugs: string[];
        nextHygiene: Array<{
          slug: string;
          title: string;
          priority: number;
          reasons: string[];
          completeness: number;
          ageDays: number | null;
          lastEnrichedAt: string | null;
          reviewStatus: string | null;
          siteFailures: string[];
          hygiene: boolean;
          staleTier: string | null;
        }>;
        stale: Array<{
          slug: string;
          title: string;
          priority: number;
          reasons: string[];
          completeness: number;
          ageDays: number | null;
          lastEnrichedAt: string | null;
          staleTier: string | null;
        }>;
      };
    };
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(100);
  const [state, setState] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = records.filter((r) => {
      if (r.completeness < minScore || r.completeness > maxScore) return false;
      if (state && r.stateCode !== state) return false;
      if (
        q &&
        !(
          r.title.toLowerCase().includes(q) ||
          String(r.city ?? "").toLowerCase().includes(q) ||
          String(r.stateCode ?? "").toLowerCase().includes(q) ||
          r.slug.includes(q)
        )
      ) {
        return false;
      }
      const reasons: string[] = (r as { refreshReasons?: string[] }).refreshReasons ?? [];
      const hygiene = Boolean((r as { hygiene?: boolean }).hygiene);
      const age = (r as { ageDays?: number | null }).ageDays;
      if (ledgerFilter === "hygiene" && !hygiene) return false;
      if (ledgerFilter === "thin" && !reasons.some((x) => x.startsWith("thin-"))) return false;
      if (ledgerFilter === "site" && !reasons.some((x) => x.startsWith("site-failure"))) return false;
      if (
        ledgerFilter === "review" &&
        !reasons.some((x) => x === "review-overdue" || x === "review-due-soon")
      ) {
        return false;
      }
      if (ledgerFilter === "stale") {
        const tier = (r as { staleTier?: string | null }).staleTier;
        const staleA = typeof age === "number" && age >= (freshness?.tiers.A ?? 30);
        if (!tier && !staleA && !reasons.includes("never-enriched")) return false;
      }
      return true;
    });
    if (ledgerFilter === "hygiene" || ledgerFilter === "stale") {
      return list
        .slice()
        .sort(
          (a, b) =>
            ((b as { refreshPriority?: number }).refreshPriority ?? 0) -
              ((a as { refreshPriority?: number }).refreshPriority ?? 0) ||
            a.completeness - b.completeness,
        );
    }
    return list.slice().sort((a, b) => a.completeness - b.completeness || a.title.localeCompare(b.title));
  }, [query, minScore, maxScore, state, records, ledgerFilter, freshness?.tiers.A]);

  const maxStateCount = Math.max(...states.map((s) => s.count), 1);
  const covered = states.filter((s) => s.count > 0);
  const empty = states.filter((s) => s.count === 0);

  return (
    <main className="min-h-dvh pb-28">
      <header className="grain-veil relative isolate overflow-hidden border-b border-border-strong bg-surface-sunken">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20">
          <SiteNav />
          <h1 className="mt-10 max-w-4xl font-display text-[2.2rem] font-normal leading-[1.02] tracking-[-0.02em] sm:text-5xl lg:text-[3.9rem]">
            Coverage console —
            <br />
            <span className="text-primary">how far the corpus reaches.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Counted at {dt(generatedAt)} UTC from first-party restaurant pages. Completeness is
            an 18-check score over address, hours, contact, booking path, price, policy language and
            provenance — a low score means fields are unstated, not wrong. Every record now uses the
            same 12-field case file; unstated fields stay visible.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Records"
              value={totals.records}
              note={`${totals.enriched} have a first-party page read`}
            />
            <Stat
              label="Mean completeness"
              value={`${totals.avgCompleteness}%`}
              note={`${totals.resolved} matched, ${totals.unresolved} unresolved`}
              tone="verified"
            />
            <Stat
              label="US states covered"
              value={`${totals.statesCovered}/${totals.statesTotal}`}
              note={`${empty.length} still empty`}
              tone="unknown"
            />
            <Stat
              label="Queue pending"
              value={queue.pending}
              note={
                queue.paused
                  ? "Expansion paused"
                  : (totals.hygiene ?? 0) > 0
                    ? `Hygiene ${totals.hygiene} first · cap ${queue.dailyCap}/day`
                    : `${queue.restaurantsPerRun}/run · cap ${queue.dailyCap}/day`
              }
              tone={queue.paused || (totals.hygiene ?? 0) > 0 ? "watch" : "verified"}
            />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <div className="plate grain-veil space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <Eyebrow>Refresh & hygiene · operate without the run-log</Eyebrow>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Refresh competes ahead of discovery under the daily cap. After the leveling pass,
                hygiene is the leftover unread pages: site failures, source-limited listings, and
                first-party review windows. Calendar tiers: A {freshness?.tiers.A ?? 30}d (hours/price), B{" "}
                {freshness?.tiers.B ?? 90}d (identity), C {freshness?.tiers.C ?? 120}d (policy scrape).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Show all"],
                  ["hygiene", "Hygiene due"],
                  ["stale", "Stale view"],
                  ["thin", "Thin <70%"],
                  ["site", "Unread pages"],
                  ["review", "Review due"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setLedgerFilter(id);
                    setMinScore(0);
                    setMaxScore(100);
                    setQuery("");
                    setState("");
                  }}
                  aria-pressed={ledgerFilter === id}
                  className={
                    "rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors " +
                    (ledgerFilter === id
                      ? "border-primary/40 bg-primary/12 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label="Hygiene due"
              value={totals.hygiene ?? 0}
              note={`next batch ${freshness?.hygieneBatchSize ?? 25}`}
              tone={(totals.hygiene ?? 0) > 0 ? "watch" : "verified"}
            />
            <Stat
              label="Never enriched"
              value={totals.neverEnriched ?? 0}
              note="Listing shells first"
              tone={(totals.neverEnriched ?? 0) > 0 ? "critical" : "verified"}
            />
            <Stat
              label="Thin / unread"
              value={`${totals.thin ?? 0} / ${totals.siteFailures ?? 0}`}
              note="Completeness & scrape"
              tone={(totals.thin ?? 0) + (totals.siteFailures ?? 0) > 0 ? "watch" : "unknown"}

            />
            <Stat
              label="Review due"
              value={totals.reviewDue ?? 0}
              note="First-party window"
              tone={(totals.reviewDue ?? 0) > 0 ? "watch" : "verified"}
            />
            <Stat
              label="Stale A / B / C"
              value={`${totals.staleA ?? 0}/${totals.staleB ?? 0}/${totals.staleC ?? 0}`}
              note="Calendar tiers"
              tone={(totals.staleA ?? 0) > 0 ? "unknown" : "verified"}
            />
          </div>

          {freshness?.nextHygiene?.length ? (
            <div>
              <Eyebrow>Next hygiene batch (priority order)</Eyebrow>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {freshness.nextHygiene.slice(0, freshness.hygieneBatchSize ?? 25).map((item) => (
                  <li
                    key={item.slug}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5"
                  >
                    <Link
                      to="/record/$slug"
                      params={{ slug: item.slug }}
                      className="tap min-w-0 truncate text-[13px] text-foreground hover:text-primary"
                    >
                      {item.title}
                    </Link>
                    <span className="text-num shrink-0 text-[11px] text-subtle">
                      p{item.priority} · {item.completeness}% · {item.reasons.slice(0, 3).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-subtle">
                Finish this hygiene batch before expanding to more cities. A thin file stays thin until
                the restaurant's own pages can fill it.
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Hygiene queue is empty — safe to resume controlled expansion on pending metros.
            </p>
          )}
        </div>
      </div>


      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Completeness distribution */}
        <Reveal as="section" className="mt-12">
          <div className="plate p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Completeness distribution</Eyebrow>
                <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight sm:text-3xl">
                  Where the depth actually sits.
                </h2>
              </div>
              <p className="max-w-md text-[12px] leading-relaxed text-subtle">
                {totals.withRating} records carry an aggregate rating, {totals.withPrice} carry a
                price band. Everything else stays open rather than being filled by inference.
              </p>
            </div>
            <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {distribution.map((band) => (
                <li key={band.label} className="rounded-xl border border-border p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] text-foreground">{band.label}%</span>
                    <span className="text-num text-[15px] text-foreground">{band.count}</span>
                  </div>
                  <GrowBar
                    className="mt-3"
                    value={(band.count / Math.max(totals.records, 1)) * 100}
                    tone={
                      band.label === "90-100"
                        ? "verified"
                        : band.label === "under 50"
                          ? "critical"
                          : "primary"
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* Geography */}
        <Reveal as="section">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>Records by US state</Eyebrow>
                <span className="text-num text-[11px] text-subtle">{covered.length} with records</span>
              </div>
              <ul className="mt-4 divide-y divide-border">
                {covered.map((s) => (
                  <li key={s.code} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-num text-[13px] text-foreground">{s.code}</span>
                      <span className="text-num shrink-0 text-[13px] text-muted-foreground">
                        {s.count}
                        <span className="text-subtle"> · {s.avgCompleteness}% mean</span>
                      </span>
                    </div>
                    <GrowBar
                      className="mt-2"
                      value={(s.count / maxStateCount) * 100}
                      tone={scoreTone(s.avgCompleteness)}
                    />
                    <p className="mt-1.5 text-[11px] text-subtle">
                      {s.enriched}/{s.count} enriched · {s.perMillion} per million residents
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">
              <Eyebrow>Not yet represented</Eyebrow>
              <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                These states hold no record yet. They are queued by population, not filled to make a
                map look complete.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {empty.map((s) => (
                  <span
                    key={s.code}
                    className="text-num rounded-md border border-border bg-surface-raised px-2 py-1 text-[11px] text-subtle"
                  >
                    {s.code}
                  </span>
                ))}
              </div>

              {outsideUs.length ? (
                <>
                  <Eyebrow className="mt-8">Outside the United States</Eyebrow>
                  <ul className="mt-3 divide-y divide-border">
                    {outsideUs.map((o) => (
                      <li key={o.code} className="flex items-baseline justify-between py-2">
                        <span className="text-num text-[12px] text-foreground">{o.code}</span>
                        <span className="text-num text-[12px] text-subtle">
                          {o.count} · {o.avgCompleteness}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <Eyebrow className="mt-8">Next cities queued</Eyebrow>
              <ul className="mt-3 divide-y divide-border">
                {queue.next.map((c) => (
                  <li key={`${c.city}-${c.stateCode}`} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="truncate text-[12px] text-foreground">
                      {c.city}, {c.stateCode}
                    </span>
                    <span className="text-num shrink-0 text-[11px] text-subtle">
                      #{c.priority} · {c.tier}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        <Rule className="my-14" />

        {/* Record ledger with search */}
        <Reveal as="section">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Record ledger</Eyebrow>
              <h2 className="mt-2 font-display text-2xl leading-tight tracking-tight sm:text-3xl">
                Search the corpus by name, city or state.
              </h2>
            </div>
            <Chip tone={filtered.length === records.length ? "neutral" : "accent"}>
              <span className="text-num">{filtered.length}</span> of {records.length} shown
            </Chip>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search name, city, state code"
                aria-label="Search the record ledger"
                className="tap w-full rounded-lg border border-input bg-surface-raised px-3 py-2 pr-10 text-[13px] text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:text-foreground"
                >
                  ×
                </button>
              ) : null}
            </div>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              aria-label="Filter by state"
              className="tap rounded-lg border border-input bg-surface-raised px-3 py-2 text-[13px] text-foreground"
            >
              <option value="">All states</option>
              {covered.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} ({s.count})
                </option>
              ))}
            </select>
            <div
              className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised/70 p-0.5"
              role="group"
              aria-label="Minimum completeness"
            >
              {[0, 50, 75, 90].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMinScore(v)}
                  aria-pressed={minScore === v}
                  className={`tap min-w-11 rounded-md px-2.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                    minScore === v ? "bg-primary/15 text-primary" : "text-subtle hover:text-foreground"
                  }`}
                >
                  {v === 0 ? "All" : `${v}+`}
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-6 divide-y divide-border">
            {filtered.slice(0, 120).map((r) => (
              <li key={r.slug} className="py-3">
                <Link
                  to="/record/$slug"
                  params={{ slug: r.slug }}
                  className="tap group flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <span className="min-w-0 truncate text-[13px] text-foreground transition-colors group-hover:text-primary">
                    {r.title}
                  </span>
                  <span className="text-num shrink-0 text-[12px] text-muted-foreground">
                    {r.completeness}%
                  </span>
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
                  <span>
                    {r.city || "—"}
                    {r.stateCode ? `, ${r.stateCode}` : ""}
                  </span>
                  <span>{r.matchStatus}</span>
                  {r.priceBand ? <span>{r.priceBand}</span> : null}
                  {r.rating != null ? (
                    <span className="text-num">
                      {r.rating} · {r.reviewCount ?? 0} reviews
                    </span>
                  ) : (
                    <span>rating unstated</span>
                  )}
                  <span>enriched {dt(r.lastEnrichedAt)}</span>
                  {(r as { hygiene?: boolean }).hygiene ? (
                    <Chip tone="watch">hygiene</Chip>
                  ) : null}
                  {(r as { refreshReasons?: string[] }).refreshReasons?.length ? (
                    <span className="truncate">
                      {(r as { refreshReasons?: string[] }).refreshReasons!.slice(0, 3).join(" · ")}
                    </span>
                  ) : null}
                </div>
                <GrowBar className="mt-2" value={r.completeness} tone={scoreTone(r.completeness)} />
              </li>
            ))}
          </ul>
          {filtered.length > 120 ? (
            <p className="mt-4 text-[12px] text-subtle">
              Showing the first 120 matches — narrow the search to see the rest.
            </p>
          ) : null}
          {!filtered.length ? (
            <p className="mt-6 text-[13px] text-muted-foreground">
              No record matches that search. Clear the filters to see the full ledger.
            </p>
          ) : null}
        </Reveal>

        <Rule className="my-14" />

        {/* Pipeline */}
        <Reveal as="section">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <Eyebrow>Recent first-party reads</Eyebrow>
              <ul className="mt-4 divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.slug} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                    <Link
                      to="/record/$slug"
                      params={{ slug: r.slug }}
                      className="tap min-w-0 truncate text-[13px] text-foreground hover:text-primary"
                    >
                      {r.title}
                    </Link>
                    <span className="text-num shrink-0 text-[11px] text-subtle">
                      {r.completeness}% · {dt(r.lastEnrichedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow>Pipeline runs</Eyebrow>
              <p className="mt-2 text-[12px] leading-relaxed text-subtle">
                Batch size, quota and pinned cities are steered from the queue file, so growth
                continues on a controlled schedule rather than a national sprint.
              </p>
              <ul className="mt-4 divide-y divide-border">
                {runs.map((r, i) => (
                  <li key={`${r.kind}-${r.startedAt}-${i}`} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] text-foreground">{r.kind}</span>
                      <span className="text-num text-[11px] text-subtle">{dt(r.startedAt)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-subtle">
                      batch {r.batchSize} · inserted {r.inserted} · resolved {r.resolved} ·
                      unresolved {r.unresolved} · mean {r.avgCompleteness}% · retries {r.retries} ·
                      failures {r.failures}
                      {r.cities?.length ? ` · ${r.cities.join(", ")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        <Rule className="my-14" />

        <Reveal as="section">
          <RunPlanner />
        </Reveal>

      </div>
    </main>
  );
}
