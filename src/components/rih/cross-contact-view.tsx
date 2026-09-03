import { Chip, Eyebrow } from "@/components/rih/bits";
import { DecisionCard } from "@/components/rih/decision-card";
import {
  CROSS_CONTACT_TONE,
  splitByCrossContact,
  type CrossContactState,
} from "@/lib/cross-contact";
import type { Scored, Situation } from "@/lib/intelligence";
import type { NightDetails } from "@/lib/night-context";
import { useMemo } from "react";

/**
 * The ranked view a reader gets after saying an allergy or celiac diagnosis is
 * the thing that cannot go wrong.
 *
 * It is the ordinary ranking, cut into the three published states and labelled.
 * Rooms that said nothing stay in the list at the bottom with their count
 * printed, because dropping them would quietly turn "we hold no evidence" into
 * "we checked and they failed".
 */

const stateChip: Record<CrossContactState, string> = {
  published: "In their own words",
  "dietary-only": "Different claim",
  silent: "No evidence held",
};

function Band({
  state,
  heading,
  lead,
  children,
}: {
  state: CrossContactState;
  heading: string;
  lead: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mt-9 first:mt-7">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-2xl leading-tight tracking-tight">{heading}</h3>
        <Chip tone={CROSS_CONTACT_TONE[state]}>{stateChip[state]}</Chip>
      </div>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{lead}</p>
      {children}
    </section>
  );
}

export function CrossContactView({
  ranked,
  situation,
  details,
  onOpen,
  regionLabel,
  limit,
  onMore,
}: {
  ranked: Scored[];
  situation: Situation;
  details: NightDetails;
  onOpen: (slug: string) => void;
  regionLabel: string;
  limit: number;
  onMore: () => void;
}) {
  const split = useMemo(() => splitByCrossContact(ranked, (sc) => sc.record), [ranked]);
  const total = ranked.length;
  const where = regionLabel || "this region";
  const rooms = (n: number) => `${n} room${n === 1 ? "" : "s"}`;

  const card = (sc: Scored) => (
    <DecisionCard
      key={sc.record.slug}
      sc={sc}
      situation={situation}
      details={details}
      onOpen={() => onOpen(sc.record.slug)}
    />
  );

  return (
    <div>
      <div className="rounded-2xl border border-border bg-surface-sunken/45 p-6 sm:p-8">
        <Eyebrow className="text-gilt">Cross-contact</Eyebrow>
        <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
          Almost nobody publishes this.
        </h2>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-foreground">
          Deep Dish sorts on what a restaurant has put on its own pages and on nothing else, so the
          first list here is short. Underneath it, kept separate, are the rooms that publish a vegan
          section or a gluten-free bun and then go quiet about how the kitchen is run. Two different
          claims. They do not get merged into one reassuring badge.
        </p>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Everything in the first list is the restaurant&rsquo;s own wording, lifted off the
          restaurant&rsquo;s own pages. A published practice is a claim they made. Nobody here has
          stood in that kitchen during service and checked it, and the conversation that settles it
          still happens live, on the phone, with you naming the allergen and someone who cooks
          telling you what happens to it.
        </p>
      </div>

      <Band
        state="published"
        heading="Published an allergen or cross-contact practice"
        lead={
          split.published.length
            ? `${rooms(split.published.length)} of the ${total} Deep Dish holds for ${where}. Some of this wording is a refusal rather than a welcome. That still counts. Read it before you call.`
            : `Not one of the ${rooms(total)} Deep Dish holds for ${where} has published anything about allergen handling. The list is empty because the kitchens are quiet, not because the filter is broken.`
        }
      >
        {split.published.length ? (
          <div className="mt-5 space-y-4">{split.published.map(card)}</div>
        ) : null}
      </Band>

      {split.dietaryOnly.length ? (
        <Band
          state="dietary-only"
          heading="Publishes dietary options and stops there"
          lead={`${rooms(split.dietaryOnly.length)} here mark dishes or run a separate menu. A dish marked gluten-free tells you what went into it and says nothing about the pan it met on the way out. Somewhere to start the phone call.`}
        >
          <div className="mt-5 space-y-4">{split.dietaryOnly.map(card)}</div>
        </Band>
      ) : null}

      {split.silent.length ? (
        <Band
          state="silent"
          heading="Said nothing at all"
          lead={`${rooms(split.silent.length)} in ${where} publish no dietary or allergen language whatsoever. They stay in the list and they rank last, because a gap in our record is not a verdict on the kitchen. It is a gap.`}
        >
          <div className="mt-5 space-y-4">{split.silent.slice(0, limit).map(card)}</div>
          {limit < split.silent.length ? (
            <button
              type="button"
              onClick={onMore}
              className="tap mt-6 w-full rounded-xl border border-border bg-surface py-3.5 text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Show more of the quiet ones
            </button>
          ) : null}
        </Band>
      ) : null}
    </div>
  );
}
