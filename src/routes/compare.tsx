import { createFileRoute, Link } from "@tanstack/react-router";
import { canonical } from "@/lib/seo";
import { Button, Eyebrow, LayerBadge } from "@/components/ui";
import { bySlug } from "@/data/restaurants";
import { scoreRecord } from "@/lib/intelligence";
import { useNight } from "@/lib/store";
import { emptySituation } from "@/lib/types";

export const Route = createFileRoute("/compare")({
  component: ComparePage,
  head: () => ({ meta: [{ title: "Compare rooms — Deep Dish" }] , links: [canonical("/compare")] }),
});

function ComparePage() {
  const store = useNight();
  const situation = store.hydrated ? store.situation() : emptySituation;
  const night = store.nights.find((n) => n.id === store.activeId);
  const slugs = night?.compare.length ? night.compare : night?.shortlist.slice(0, 3) ?? [];
  const items = slugs
    .map((s) => bySlug.get(s))
    .filter(Boolean)
    .map((r) => scoreRecord(r!, situation));

  const fields: { key: string; label: string; get: (sc: (typeof items)[number]) => string }[] = [
    { key: "fit", label: "Situation fit", get: (sc) => `${sc.fit}/100` },
    { key: "burden", label: "Confirm burden", get: (sc) => `${sc.burden}/100` },
    { key: "verdict", label: "Hold?", get: (sc) => (sc.blocked ? "Hold" : sc.criticals.length ? "Conditional" : "Clear") },
    { key: "path", label: "Booking path", get: (sc) => sc.record.bookingPlatforms.join(", ") },
    { key: "cancel", label: "Cancellation", get: (sc) => sc.record.cancellationPolicy },
    { key: "diet", label: "Dietary", get: (sc) => sc.record.dietaryDetails },
    { key: "access", label: "Access", get: (sc) => sc.record.accessibilityState },
    { key: "hours", label: "Hours", get: (sc) => sc.record.hoursSummary },
    { key: "price", label: "Price", get: (sc) => sc.record.priceDetails },
    { key: "pace", label: "Meal length", get: (sc) => sc.record.typicalMealLength },
    { key: "noise", label: "Noise band", get: (sc) => sc.record.noiseBand },
    { key: "unknowns", label: "Unknowns", get: (sc) => String(sc.record.unknownsCount) },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>Compare</Eyebrow>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Differences, not repeats</h1>
      <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
        Hold up to three rooms from the night. Identical cells are the least useful thing on a
        comparison — scan for the constraint that actually splits them.
      </p>
      {!items.length ? (
        <p className="mt-8 text-muted-foreground">
          Mark rooms to compare from{" "}
          <Link to="/night" className="tap inline-flex items-center text-primary underline underline-offset-2">
            the night
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background p-3 text-subtle">Field</th>
                {items.map((sc) => (
                  <th key={sc.record.slug} className="p-3">
                    <p className="font-display text-xl">{sc.record.title}</p>
                    <p className="text-[11px] font-normal text-muted-foreground">{sc.record.city}</p>
                    {sc.blocked ? <LayerBadge layer="hold" /> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const values = items.map((sc) => f.get(sc));
                const same = values.every((v) => v === values[0]);
                return (
                  <tr key={f.key} className="border-t border-border">
                    <th className="sticky left-0 bg-background p-3 text-left font-medium">{f.label}</th>
                    {values.map((v, i) => (
                      <td
                        key={items[i]!.record.slug}
                        className={`p-3 align-top leading-relaxed ${same ? "text-subtle" : "text-foreground"}`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <th className="sticky left-0 bg-background p-3">Next</th>
                {items.map((sc) => (
                  <td key={sc.record.slug} className="p-3">
                    <Button asChild>
                      <Link to="/confirm/$slug" params={{ slug: sc.record.slug }}>
                        Confirm this room
                      </Link>
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
