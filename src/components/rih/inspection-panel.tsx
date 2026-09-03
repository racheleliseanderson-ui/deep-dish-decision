// UNREFERENCED as of 2026-09-02 — see DEAD-CODE.md
import { Chip, Eyebrow } from "@/components/rih/bits";
import { getInspection, inspectionCoverage } from "@/lib/inspections";

export function InspectionPanel({ slug }: { slug: string }) {
  const row = getInspection(slug);
  // "Not on file" is a claim about this restaurant. It is only true when the
  // layer holds records at all; when the layer is empty the honest statement
  // is about the build, and the chip should not read as a finding.
  const layerLoaded = inspectionCoverage() > 0;
  return (
    <section className="rounded-xl border border-border bg-surface-raised/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Eyebrow>Health inspection</Eyebrow>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-subtle">
            Public jurisdiction snapshots, matched on name and address. Missing stays missing —
            never inferred from cuisine, stars, or a single review.
          </p>
        </div>
        <Chip tone={row ? (row.closed ? "critical" : "watch") : "unknown"}>
          {row
            ? row.closed
              ? "Closure flagged"
              : "Public snapshot"
            : layerLoaded
              ? "Not on file"
              : "Layer not loaded"}
        </Chip>
      </div>

      {!row ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          {layerLoaded
            ? "No matched public inspection is on file. Cleanliness stays held-open."
            : "The inspection layer carries no records in this build, so this restaurant was not checked against one. Cleanliness stays held-open."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{row.note}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Meta label="Jurisdiction" value={row.jurisdiction} />
            <Meta label="Latest visit" value={row.latestInspectionDate ?? "Unstated"} />
            <Meta label="Result / grade" value={[row.latestResult, row.grade].filter(Boolean).join(" · ") || "Unstated"} />
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-subtle">
            {row.programName} · {row.address}
            {row.latestScore != null ? ` · score ${row.latestScore}` : ""}
          </p>
          {row.redViolations.length ? (
            <div className="mt-4">
              <p className="text-eyebrow">Red / critical items on that visit</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted-foreground">
                {row.redViolations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              No red / critical items listed on that visit.
            </p>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-subtle">
            Source: {row.dataset} · retrieved {row.retrievedAt.slice(0, 10)} ·{" "}
            <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              jurisdiction search
            </a>
            . Not a Deep Dish score.
          </p>
        </>
      )}
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
