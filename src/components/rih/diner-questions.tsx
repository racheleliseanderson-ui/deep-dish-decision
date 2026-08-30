import { Chip, Eyebrow } from "@/components/rih/bits";
import { PlateMarkSvg } from "@/lib/listing-visual";
import { buildDinerAnswers, type DinerAnswer } from "@/lib/diner-questions";
import { buildFoodIntel } from "@/lib/food-intel";
import { identityCaption, primaryVisual, provenanceLabel } from "@/lib/visual-program";
import type { RestaurantRecord } from "@/lib/dataset";
import { cn } from "@/lib/utils";

export function DinerQuestions({ record }: { record: RestaurantRecord }) {
  const answers = buildDinerAnswers(record);
  const food = buildFoodIntel(record);
  const visual = primaryVisual(record.slug);

  return (
    <div className="space-y-8">
      <section className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex justify-center sm:block">
          {visual ? (
            <figure className="overflow-hidden rounded-2xl border border-border bg-surface-sunken">
              <img
                src={visual.src}
                alt={visual.alt}
                width={220}
                height={220}
                className="size-[160px] object-cover sm:size-[200px]"
                loading="lazy"
              />
              <figcaption className="max-w-[200px] px-2 py-2 text-[10px] leading-relaxed text-subtle">
                {provenanceLabel(visual)}
              </figcaption>
            </figure>
          ) : (
            <figure className="flex flex-col items-center">
              <div className="plate flex items-center justify-center p-3 text-muted-foreground">
                <PlateMarkSvg r={record} size={120} />
              </div>
              <figcaption className="mt-2 max-w-[200px] text-center text-[10px] leading-relaxed text-subtle">
                {identityCaption(record)}
              </figcaption>
            </figure>
          )}
        </div>
        <div className="min-w-0">
          <Eyebrow>Why go</Eyebrow>
          <p className="mt-2 font-display text-2xl leading-tight tracking-tight">{food.culinaryIdentity ?? record.title}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{food.whatToOrder}</p>
          {food.differentiator ? (
            <p className="mt-3 text-[13px] leading-relaxed text-foreground">{food.differentiator}</p>
          ) : null}
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">
            First-party evidence only on this block. Public-review patterns sit in their own layer and
            never rewrite these lines.
          </p>
        </div>
      </section>

      <section>
        <Eyebrow>Before you book</Eyebrow>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Why go, what to order, what it costs, what the room is like, whether it fits tonight, and
          what you still need to confirm. Held-open means the restaurant has not said.
        </p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {answers.map((a) => (
            <QuestionCard key={a.id} answer={a} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function QuestionCard({ answer }: { answer: DinerAnswer }) {
  return (
    <li className="rounded-xl border border-border bg-background/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-snug text-foreground">
          <span className="text-num mr-2 text-[11px] text-subtle">
            {String(answer.n).padStart(2, "0")}
          </span>
          {answer.question}
        </p>
        <Chip tone={answer.open ? "unknown" : sourceTone(answer)} className="shrink-0">
          {answer.open ? "Held open" : "On file"}
        </Chip>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{answer.answer}</p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-subtle">{answer.sourceLabel}</p>
    </li>
  );
}

function sourceTone(a: DinerAnswer): "verified" | "watch" | "unknown" {
  if (a.source === "publicReputationEvidence") return "watch";
  if (a.source === "firstPartyEvidence") return "verified";
  return "unknown";
}

export function QuestionStrip({ answers, className }: { answers: DinerAnswer[]; className?: string }) {
  const lead = answers.filter((a) => !a.open).slice(0, 3);
  if (!lead.length) return null;
  return (
    <ul className={cn("space-y-1.5 text-[12px] leading-relaxed text-muted-foreground", className)}>
      {lead.map((a) => (
        <li key={a.id}>
          <span className="text-foreground">{a.question} </span>
          {a.answer}
        </li>
      ))}
    </ul>
  );
}
