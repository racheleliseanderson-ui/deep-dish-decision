import { createFileRoute, Link } from "@tanstack/react-router";
import { canonical } from "@/lib/seo";
import { Button, Eyebrow, LayerBadge } from "@/components/ui";
import { duplicateNight } from "@/lib/storage";
import { useNight } from "@/lib/store";
import { formatHumanDate } from "@/lib/utils";

export const Route = createFileRoute("/nights")({
  component: NightsPage,
  head: () => ({ meta: [{ title: "Saved records — Deep Dish" }] , links: [canonical("/nights")] }),
});

function NightsPage() {
  const store = useNight();
  const nights = [...store.nights].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Eyebrow>On this device</Eyebrow>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Nights and confirmation records</h1>
      <p className="mt-2 max-w-xl text-[14px] text-muted-foreground">
        Nothing is uploaded. Duplicate a night to try a different constraint without losing the
        original. The confirmations you finish are the thing you keep.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Saved confirmations</h2>
        {store.passes.length ? (
          <ul className="mt-4 space-y-3">
            {store.passes.map((p) => (
              <li key={p.id} className="plate flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-display text-xl">{p.restaurantTitle}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatHumanDate(p.capture.reservationDate || p.situation.nightDate)} ·{" "}
                    {p.capture.confirmationNumber || "no confirmation number"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <LayerBadge layer={p.status} />
                  <Button asChild variant="outline">
                    <Link to="/packet/$id" params={{ id: p.id }}>
                      Open confirmation
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-muted-foreground">
            No confirmations saved yet. Rank a night, open a room, and work through the
            confirmation pass — it saves here.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl">Saved nights</h2>
        {nights.length ? (
          <ul className="mt-4 space-y-3">
            {nights.map((n) => (
              <li key={n.id} className="plate p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl">
                      {n.name} {n.pinned ? "· pinned" : ""}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {n.situation.occasion ?? "no occasion"} · {n.situation.partySize ?? "?"} covers ·{" "}
                      {n.shortlist.length} held
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link to="/night" onClick={() => store.setActive(n.id)}>
                        Continue
                      </Link>
                    </Button>
                    <Button variant="ghost" onClick={() => store.pinNight(n.id)}>
                      {n.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        duplicateNight(n);
                        store.reload();
                      }}
                    >
                      Duplicate
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-muted-foreground">Start a night and it will autosave here.</p>
        )}
      </section>
    </main>
  );
}
