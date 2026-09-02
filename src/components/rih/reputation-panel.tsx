import { Chip, Eyebrow } from "@/components/rih/bits";
import { buildReputation, type PublicReputationEvidence } from "@/lib/reputation";

export function ReputationPanel({ slug }: { slug: string }) {
  const rep = buildReputation(slug);
  return <ReputationBody rep={rep} />;
}

function ReputationBody({ rep }: { rep: PublicReputationEvidence }) {
  return (
    <section className="rounded-xl border border-border bg-surface-raised/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Eyebrow>Public-review pattern</Eyebrow>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-subtle">
            Third-party directory and research signals, held apart from the restaurant's own pages.
            A listing rating does not rank this record.
          </p>
        </div>
        <Chip tone={strengthTone(rep)}>{strengthLabel(rep)}</Chip>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{rep.patternSummary}</p>

      {rep.operationalNote ? (
        <p className="mt-3 rounded-lg border border-critical/30 bg-critical/8 px-3 py-2 text-[13px] leading-relaxed text-foreground">
          {rep.operationalNote}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Meta
          label="Sample size"
          value={rep.sampleSize != null ? rep.sampleSize.toLocaleString() : "Not on file"}
        />
        <Meta
          label="Listing rating (context)"
          value={rep.listingRating != null ? String(rep.listingRating) : "Not on file"}
        />
        <Meta label="Recency" value={rep.recency ?? "Not on file"} />
      </dl>

      {rep.directoryBlurb ? (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-eyebrow block">
            {rep.listingSource ?? "Directory"} editorial copy
          </span>
          <span className="mt-1 block">{rep.directoryBlurb}</span>
        </p>
      ) : null}

      {rep.recurringPraise.length ? (
        <PatternList title="Repeated recent praise" items={rep.recurringPraise} />
      ) : null}
      {rep.recurringComplaints.length ? (
        <PatternList title="Recurring complaint" items={rep.recurringComplaints} />
      ) : null}

      {rep.dishesRecommended.length ? (
        <PatternList title="Dishes named in public reviews" items={rep.dishesRecommended} />
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-subtle">
        Sources: {rep.sourceMix.join(" · ") || "none"}. Held off the ranking.
      </p>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="mt-1 text-num text-sm text-foreground">{value}</dd>
    </div>
  );
}

function PatternList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-eyebrow">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function strengthTone(rep: PublicReputationEvidence): "unknown" | "watch" | "verified" {
  if (rep.evidenceStrength === "none") return "unknown";
  if (rep.evidenceStrength === "listing_sample_only" || rep.evidenceStrength === "thin") return "watch";
  return "verified";
}

function strengthLabel(rep: PublicReputationEvidence): string {
  switch (rep.evidenceStrength) {
    case "none":
      return "No pattern on file";
    case "listing_sample_only":
      return "Listing sample only";
    case "thin":
      return "Thin evidence";
    case "mixed":
      return "Mixed evidence";
    case "strong_but_mixed":
      return "Strong but mixed evidence";
  }
}
