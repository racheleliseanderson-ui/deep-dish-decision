import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { MobileHowTo } from "@/components/mobile-nav";
import { DecisionBrief } from "@/components/results";
import { Button, Eyebrow, LayerBadge } from "@/components/ui";
import { OPS, restaurants } from "@/data/restaurants";
import { rank, situationDepth } from "@/lib/intelligence";
import { DEMO_NIGHT } from "@/lib/playbooks";
import { track } from "@/lib/storage";
import { useNight } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Deep Dish — Confirm the night. Then book." },
      {
        name: "description",
        content:
          "Not a ratings board. Rank rooms against your actual situation, then complete a confirmation pass: hours, cancellation, access, allergy, confirmation number.",
      },
    ],
  }),
});

function Home() {
  const startNight = useNight((s) => s.startNight);
  const demo = useMemo(() => rank(restaurants, DEMO_NIGHT), []);
  const lead = demo[0]!;
  const depth = situationDepth(DEMO_NIGHT);

  return (
    <main>
      <section className="ink-band">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-eyebrow text-gilt">Salty & Clever · Restaurant intelligence</p>
          <div className="gilt-rule mt-3 max-w-md" />
          <h1 className="display-statement mt-7 max-w-[18ch]">
            Confirm the night.
            <br />
            <span className="text-gilt">Then book.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-ink-foreground/80">
            Ratings will not tell you whether the kitchen can handle celiac, whether the restroom is
            on the same level, or what a cancellation actually costs. Deep Dish ranks a room against
            the night you have declared, keeps every unknown visible, and finishes as a confirmation
            pass you can keep.
          </p>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-foreground/70 sm:hidden">
            The bar at the bottom is the map — Start, Night, Records, Method.{" "}
            <a href="#how-you-move" className="tap inline-flex items-center text-gilt underline underline-offset-2">
              How you move
            </a>
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link
                to="/night"
                onClick={() => {
                  startNight(DEMO_NIGHT, "Denver date night");
                  track("demo_loaded", { playbook: "date-night" });
                }}
              >
                Load a Denver date night
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/night"
                onClick={() => {
                  startNight();
                  track("workflow_started", { from: "blank" });
                }}
              >
                Describe my night
              </Link>
            </Button>
          </div>
          <dl className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              [String(OPS.count), "Rooms in this working set"],
              [String(OPS.regions), "Cities"],
              [String(OPS.openQuestions), "Questions left open"],
              [String(OPS.reachable), "Reachable by phone"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-eyebrow text-gilt">{l}</dt>
                <dd className="text-num mt-1 text-3xl">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="border-b border-border sm:hidden">
        <MobileHowTo className="mx-auto max-w-6xl px-4 py-10" />
      </div>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-3">
          {[
            {
              n: "01",
              t: "The problem",
              d: "A star average describes the mean night, never yours. Access, allergy, cancellation, and hours are the fields that actually ruin an evening — and they are the fields restaurants leave unsaid.",
            },
            {
              n: "02",
              t: "What you leave with",
              d: "A ranked shortlist against a declared situation, then a confirmation pass: exact questions, unresolved restrictions, volatile fields to recheck, cancellation terms, confirmation number, contact, date confirmed.",
            },
            {
              n: "03",
              t: "Why it is not a finder",
              d: "We will not invent certainty. Silence is unknown. A stated constraint the record cannot satisfy holds the booking. The product is the verified packet, not another map of restaurants.",
            },
          ].map((b) => (
            <div key={b.n}>
              <p className="text-num text-gilt">{b.n}</p>
              <h2 className="mt-2 font-display text-2xl tracking-tight">{b.t}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-sunken/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Eyebrow>A working demonstration</Eyebrow>
          <h2 className="mt-2 font-display text-3xl tracking-tight">
            Denver, date night, two covers, a week out.
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
            Situation depth {depth}/9. No allergy declared. The lead is scored live against that
            night — then the next step is the confirmation pass, not a booking widget.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <DecisionBrief sc={lead} situation={DEMO_NIGHT} />
            <div className="space-y-3">
              {demo.slice(1, 4).map((sc) => (
                <div key={sc.record.slug} className="plate flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-display text-xl">{sc.record.title}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {sc.record.city} · fit {sc.fit} · confirm {sc.burden}
                    </p>
                  </div>
                  {sc.blocked ? <LayerBadge layer="hold" /> : <LayerBadge layer="current" />}
                </div>
              ))}
              <Button asChild variant="ghost" className="px-0">
                <Link to="/night" onClick={() => startNight(DEMO_NIGHT, "Denver date night")}>
                  Open the full ranking
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Eyebrow>Proof</Eyebrow>
        <h2 className="mt-2 font-display text-3xl tracking-tight">What this working set refuses to do.</h2>
        <ul className="mt-5 max-w-2xl space-y-3 text-[14px] leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground">No star ratings.</span> Fit is situational and shown
            with the reasoning that produced it.
          </li>
          <li>
            <span className="text-foreground">No inference dressed as fact.</span> If the restaurant
            has not stated it, the field reads unstated.
          </li>
          <li>
            <span className="text-foreground">Fail closed.</span> Allergy, access, or private-room
            requirements the record cannot satisfy hold the booking.
          </li>
          <li>
            <span className="text-foreground">The call is the product.</span> Hours, menu, price,
            cancellation, and confirmation number belong on a packet you keep.
          </li>
        </ul>
        <p className="mt-8 text-[13px] text-subtle">
          Working set of {OPS.count} confirmation-complete files — Denver metro plus selected
          destination rooms. Thin coverage is worse than an honest set.
        </p>
      </section>
    </main>
  );
}
