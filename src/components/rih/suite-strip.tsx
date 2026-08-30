import { APP_LABELS, APP_ORIGINS, type SaltyApp } from "@/lib/salty-handoff/contract.ts";

const ORDER: SaltyApp[] = ["desk", "kitchen", "occasion", "restaurant"];

export function SuiteStrip({ current }: { current: SaltyApp }) {
  return (
    <nav
      aria-label="Salty & Clever tools"
      className="no-print border-b border-border bg-background/90"
    >
      <div className="mx-auto flex max-w-6xl min-w-0 items-center gap-1 overflow-x-auto px-4 py-1 sm:px-6">
        <span className="mr-1 hidden shrink-0 text-eyebrow text-gilt sm:inline">Suite</span>
        {ORDER.map((id) => {
          const active = id === current;
          return (
            <a
              key={id}
              href={APP_ORIGINS[id] + "/"}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "tap inline-flex min-h-11 shrink-0 items-center px-3 text-xs uppercase tracking-widest text-primary"
                  : "tap inline-flex min-h-11 shrink-0 items-center px-3 text-xs uppercase tracking-widest text-subtle hover:text-foreground"
              }
            >
              <span className="sm:hidden">{short(id)}</span>
              <span className="hidden sm:inline">{APP_LABELS[id]}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function short(id: SaltyApp): string {
  if (id === "desk") return "Desk";
  if (id === "kitchen") return "Kitchen";
  if (id === "occasion") return "Occasion";
  return "Restaurant";
}
