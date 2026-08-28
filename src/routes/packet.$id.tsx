import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { PacketView } from "@/components/confirm-pass";
import { Button } from "@/components/ui";
import { bySlug } from "@/data/restaurants";
import { packetPlaintext } from "@/lib/confirm";
import { track } from "@/lib/storage";
import { useNight } from "@/lib/store";
import { copyText, downloadJson } from "@/lib/utils";

export const Route = createFileRoute("/packet/$id")({
  component: PacketPage,
  head: () => ({
    meta: [
      { title: "Confirmation record — Deep Dish" },
      {
        name: "description",
        content: "Printable confirmation and reservation record. What was verified, what remains open.",
      },
    ],
  }),
});

function PacketPage() {
  const { id } = Route.useParams();
  const store = useNight();
  const pass = store.passes.find((p) => p.id === id);
  const [copied, setCopied] = useState(false);
  if (store.hydrated && !pass) throw notFound();
  if (!pass) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-muted-foreground">Loading packet…</p>
      </main>
    );
  }
  const record = bySlug.get(pass.slug);
  if (!record) throw notFound();

  return (
    <main className="mx-auto max-w-[880px] px-4 py-8 sm:px-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/nights" className="tap inline-flex items-center text-sm text-subtle underline-offset-2 hover:text-foreground hover:underline">
          All records
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            Print / save as PDF
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await copyText(packetPlaintext(pass, record));
              if (ok) {
                setCopied(true);
                track("export_used", { slug: pass.slug, kind: "copy" });
                window.setTimeout(() => setCopied(false), 1800);
              }
            }}
          >
            {copied ? "Copied" : "Copy as text"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              downloadJson(`deep-dish-${record.slug}-packet.json`, pass);
              track("export_used", { slug: pass.slug, kind: "json" });
            }}
          >
            Download JSON
          </Button>
          <Button asChild variant="ghost">
            <Link to="/confirm/$slug" params={{ slug: pass.slug }}>
              Edit pass
            </Link>
          </Button>
        </div>
      </div>
      <PacketView pass={pass} record={record} />
    </main>
  );
}
