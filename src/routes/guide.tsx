import { createFileRoute, Link } from "@tanstack/react-router";
import { MobileHowTo } from "@/components/mobile-nav";
import { Eyebrow } from "@/components/ui";
import { OPS, restaurants } from "@/data/restaurants";

export const Route = createFileRoute("/guide")({
  component: GuidePage,
  head: () => ({
    meta: [
      { title: "How to choose a restaurant — Deep Dish" },
      {
        name: "description",
        content:
          "Occasion first, then commitment, pathway, room, and the honest handling of everything a restaurant has not said.",
      },
    ],
  }),
});

function GuidePage() {
  const unstated = {
    access: restaurants.filter((r) => /not stated|unknown/i.test(r.accessibilityState)).length,
    diet: restaurants.filter((r) => /not stated|confirm/i.test(r.dietaryDetails)).length,
    cancel: restaurants.filter((r) => /not fully|not stated|platform/i.test(r.cancellationPolicy)).length,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>The method</Eyebrow>
      <h1 className="mt-2 font-display text-4xl tracking-tight">
        Five decisions settle a restaurant. Ratings settle none.
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
        Choosing well is not taste, it is sequence. Occasion, commitment, pathway, room, and the
        honest handling of everything a restaurant has not said.
      </p>

      <ol className="mt-12 space-y-10">
        <li>
          <p className="text-num text-gilt">01</p>
          <h2 className="mt-1 font-display text-2xl">Name the occasion before the cuisine</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            A room that is right for a negotiation dinner is wrong for a birthday of nine, whatever
            it cooks. Decide what the evening has to achieve, then let the kitchen be the tiebreak.
          </p>
        </li>
        <li>
          <p className="text-num text-gilt">02</p>
          <h2 className="mt-1 font-display text-2xl">Price the commitment, not the plate</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            The cost of a booking includes deposit, cancellation window, card hold, minimum spend
            and the length of the table. Read the reservation terms before the prices. That is where
            the evening is actually priced.
          </p>
        </li>
        <li>
          <p className="text-num text-gilt">03</p>
          <h2 className="mt-1 font-display text-2xl">Find the booking pathway early</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            A walk-in-only room cannot be promised to guests flying in; a platform-only room cannot
            absorb a late addition. Match the pathway to how firm your party is. If the party can
            still change size, you need a room with a phone that answers.
          </p>
        </li>
        <li>
          <p className="text-num text-gilt">04</p>
          <h2 className="mt-1 font-display text-2xl">Read the room, not the rating</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Noise, pacing, formality and lighting decide whether a table can hold a conversation, a
            proposal or a toast. Pacing and noise language in a restaurant’s own copy predicts your
            evening better than any score.
          </p>
        </li>
        <li>
          <p className="text-num text-gilt">05</p>
          <h2 className="mt-1 font-display text-2xl">Treat silence as unknown, never as no</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            A field a restaurant has not published is not a policy — it is an open question.
            Step-free access, dietary handling and private space are the three that most often go
            unstated and most often decide whether an evening works at all. Take every unstated
            field into the call. Confirm it, then book.
          </p>
        </li>
      </ol>

      <section className="mt-14">
        <Eyebrow>The call</Eyebrow>
        <h2 className="mt-2 font-display text-2xl">Four questions close almost every gap</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-muted-foreground">
          <li>Access, in the specific terms you need — kerb, door, table, restroom.</li>
          <li>How the kitchen handles the constraint — substitution, separate prep, or a dish removed.</li>
          <li>The real length of the table, in minutes.</li>
          <li>What cancellation actually costs, and when. Get the number, not the reassurance.</li>
        </ol>
        <p className="mt-4 text-[14px] text-muted-foreground">
          Deep Dish writes those questions against your situation and the record, then stores the
          answers as a reservation record: confirmation number, contact person, date confirmed.
        </p>
        <Link to="/night" className="tap mt-4 inline-flex items-center text-primary underline underline-offset-2">
          Start a night
        </Link>
      </section>

      <MobileHowTo className="mt-14" full />

      <section className="mt-14">
        <Eyebrow>What this working set still leaves open</Eyebrow>
        <dl className="mt-4 divide-y divide-border text-[14px]">
          {[
            ["Rooms", String(OPS.count)],
            ["Cities", String(OPS.regions)],
            ["Access route unstated", `${unstated.access} / ${OPS.count}`],
            ["Dietary protocol thin", `${unstated.diet} / ${OPS.count}`],
            ["Cancellation not fully published", `${unstated.cancel} / ${OPS.count}`],
            ["Questions held open", String(OPS.openQuestions)],
            ["Reachable by phone", String(OPS.reachable)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-num">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-subtle">
          A smaller confirmation-complete set is more useful than hundreds of thin files. Hours,
          menus, prices and reservation terms remain volatile. Confirm them live.
        </p>
      </section>
    </main>
  );
}
