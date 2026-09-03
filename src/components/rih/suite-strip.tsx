import { useEffect, useState } from "react";
import { APP_LABELS, APP_ORIGINS, type SaltyApp } from "@/lib/salty-handoff/contract.ts";
import { nightRecordUrl, readNightRecord, type SaltyNightRecord } from "@/lib/salty-night-record";

const ORDER: SaltyApp[] = ["kitchen", "occasion", "restaurant"];

/**
 * Names come from the shared contract. This file used to keep its own map,
 * which quietly shortened "Occasion OS" to "Occasion" — the suite ribbon is
 * exactly the place where every app has to be called the same thing.
 */
const LABELS = APP_LABELS;

export function SuiteStrip({ current }: { current: SaltyApp }) {
  const [night, setNight] = useState<SaltyNightRecord | null>(null);

  useEffect(() => {
    setNight(readNightRecord());
  }, []);

  return (
    <nav
      aria-label="Salty & Clever tools"
      className="no-print border-b border-border bg-background/90"
    >
      <div className="mx-auto flex max-w-6xl min-w-0 items-center gap-1 overflow-x-auto px-4 py-1 sm:px-6">
        <span className="mr-1 hidden shrink-0 text-eyebrow text-gilt sm:inline">Suite</span>
        {/* The publication, not a tool: a plain external link, no night record. */}
        <a
          href="https://saltnotes.blog"
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex min-h-11 shrink-0 items-center px-3 text-xs uppercase tracking-widest text-subtle hover:text-foreground"
        >
          Salty &amp; Clever
        </a>
        {ORDER.map((id) => {
          const active = id === current;
          const base = APP_ORIGINS[id] + "/";
          const href = night ? nightRecordUrl(base, night) : base;
          return (
            <a
              key={id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "tap inline-flex min-h-11 shrink-0 items-center px-3 text-xs uppercase tracking-widest text-primary"
                  : "tap inline-flex min-h-11 shrink-0 items-center px-3 text-xs uppercase tracking-widest text-subtle hover:text-foreground"
              }
            >
              <span className="sm:hidden">{short(id)}</span>
              <span className="hidden sm:inline">{LABELS[id]}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function short(id: SaltyApp): string {
  if (id === "kitchen") return "Kitchen";
  if (id === "occasion") return "Occasion";
  return "Restaurant";
}
