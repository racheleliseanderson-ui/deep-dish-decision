import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DecisionBrief, DepthNote, ResultCard, WhatIf } from "@/components/results";
import { SituationForm } from "@/components/situation-form";
import { Button, Eyebrow } from "@/components/ui";
import { restaurants } from "@/data/restaurants";
import { filterRecords, rank, situationDepth } from "@/lib/intelligence";
import { track } from "@/lib/storage";
import { useNight } from "@/lib/store";
import { emptySituation } from "@/lib/types";

export const Route = createFileRoute("/night")({
  component: NightPage,
  head: () => ({ meta: [{ title: "The night — Deep Dish" }] }),
});

function NightPage() {
  const store = useNight();
  const situation = store.hydrated ? store.situation() : emptySituation;
  const night = store.nights.find((n) => n.id === store.activeId);
  const [mode, setMode] = useState<"guided" | "advanced">("guided");
  const [limit, setLimit] = useState(6);

  const ranked = useMemo(() => rank(filterRecords(restaurants, situation), situation), [situation]);
  const lead = ranked[0];
  const depth = situationDepth(situation);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="mb-6 font-display text-4xl tracking-tight">The night</h1>
      <SituationForm
        situation={situation}
        onChange={(s) => {
          if (!store.activeId) store.startNight(s);
          else store.setSituation(s);
          setLimit(6);
          if (situationDepth(s) >= 3) track("meaningful_input", { depth: situationDepth(s) });
        }}
        mode={mode}
        onMode={setMode}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Clear this night? Saved confirmation packets are kept.")) {
              store.setSituation(emptySituation);
            }
          }}
        >
          Clear night
        </Button>
        {night?.shortlist.length ? (
          <Link to="/compare" className="tap inline-flex items-center text-sm text-primary underline underline-offset-2">
            Compare {night.shortlist.length} held rooms
          </Link>
        ) : null}
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Ranked against your situation</Eyebrow>
            <h2 className="mt-1 font-display text-3xl tracking-tight">
              {ranked.length} rooms · {ranked.filter((r) => r.blocked).length} held closed
            </h2>
          </div>
          <p className="text-num text-xs text-subtle">Depth {depth}/9</p>
        </div>
        <div className="gilt-rule mt-3 max-w-lg" />
        <p className="mt-3 max-w-2xl text-[13px] text-muted-foreground">
          Order is fit, confirm burden, completeness, and time pressure. Blocked rooms drop to the
          end so you can see what was excluded and why. Refine the night — the list reorders live.
        </p>
      </section>

      <div className="mt-6">
        <DepthNote situation={situation} />
      </div>

      {lead ? (
        <div className="mt-8 space-y-6">
          <DecisionBrief sc={lead} situation={situation} />
          <WhatIf slug={lead.record.slug} situation={situation} />
        </div>
      ) : (
        <div className="plate mt-8 p-8 text-center">
          <Eyebrow>No matches</Eyebrow>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Nothing in the working set matches those filters. The instrument will not widen your
            constraints to produce a result.
          </p>
        </div>
      )}

      <div className="mt-8 space-y-4">
        {ranked.slice(0, limit).map((sc) => (
          <ResultCard
            key={sc.record.slug}
            sc={sc}
            situation={situation}
            shortlisted={Boolean(night?.shortlist.includes(sc.record.slug))}
            compared={Boolean(night?.compare.includes(sc.record.slug))}
            onShortlist={() => store.toggleShortlist(sc.record.slug)}
            onCompare={() => store.toggleCompare(sc.record.slug)}
          />
        ))}
      </div>
      {limit < ranked.length ? (
        <Button variant="outline" className="mt-6 w-full" onClick={() => setLimit((n) => n + 6)}>
          Show more of {ranked.length}
        </Button>
      ) : null}
    </main>
  );
}
