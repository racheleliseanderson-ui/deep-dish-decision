import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConfirmPassView } from "@/components/confirm-pass";
import { bySlug } from "@/data/restaurants";
import { createPass } from "@/lib/confirm";
import { scoreRecord } from "@/lib/intelligence";
import { track } from "@/lib/storage";
import { useNight } from "@/lib/store";
import { emptySituation } from "@/lib/types";

export const Route = createFileRoute("/confirm/$slug")({
  component: ConfirmPage,
  head: () => ({
    meta: [
      { title: "Confirmation pass — Deep Dish" },
      {
        name: "description",
        content:
          "Exact questions to ask before booking: hours, menu, cancellation, access, allergy, confirmation number.",
      },
    ],
  }),
});

function ConfirmPage() {
  const { slug } = Route.useParams();
  const record = bySlug.get(slug);
  if (!record) throw notFound();
  const store = useNight();
  const situation = store.hydrated ? store.situation() : emptySituation;

  useEffect(() => {
    if (!store.hydrated) return;
    const nightId = store.activeId ?? store.startNight(situation).id;
    const existing = store.passes.find((p) => p.slug === slug && p.nightId === nightId);
    if (!existing) {
      const sc = scoreRecord(record, situation);
      store.savePass(createPass(record, situation, sc, nightId));
      track("confirm_started", { slug });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.hydrated, slug]);

  const nightId = store.activeId;
  const pass = store.passes.find((p) => p.slug === slug && (!nightId || p.nightId === nightId)) ??
    store.passes.find((p) => p.slug === slug);

  if (!store.hydrated || !pass) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-muted-foreground">Opening the confirmation pass…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        to="/record/$slug"
        params={{ slug }}
        className="tap inline-flex items-center text-sm text-subtle underline-offset-2 hover:text-foreground hover:underline"
      >
        Back to {record.title}
      </Link>
      <div className="mt-6">
        <ConfirmPassView pass={pass} record={record} />
      </div>
    </main>
  );
}
