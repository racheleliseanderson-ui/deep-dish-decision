import { Link, useRouterState } from "@tanstack/react-router";
import { DisplayControls } from "@/components/rih/display-controls";
import { NAV_LINKS } from "@/components/rih/nav-links";
import { useT } from "@/lib/i18n";
import { useShortlist } from "@/lib/shortlist";
import { cn } from "@/lib/utils";

/**
 * House bar — Northern Lantern House Labs wordmark, the publication, the app
 * nav and a compact display pill. One row, max six nav items, no second row.
 */

const LINKS = NAV_LINKS;

export const HOUSE_URL = "https://northernlanternhouse.com";

function DisplayPill() {
  return (
    <>
      <button
        type="button"
        popoverTarget="display-controls-popover"
        className="tap inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-raised/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-subtle transition-colors hover:text-foreground"
        aria-label="Display settings"
      >
        Display
        <span aria-hidden className="text-[9px]">
          ▾
        </span>
      </button>
      <div
        id="display-controls-popover"
        popover="auto"
        className="no-print rounded-2xl border border-border bg-popover p-3 shadow-lift"
        style={{ inset: "auto", top: "3.25rem", right: "1rem", width: "min(20rem, calc(100vw - 2rem))" }}
      >
        <DisplayControls />
      </div>
    </>
  );
}


export function HouseBar({ className }: { className?: string }) {
  const { slugs } = useShortlist();
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div
      className={cn(
        "no-print flex min-w-0 items-center gap-x-4 gap-y-2 overflow-x-auto whitespace-nowrap px-4 py-3 text-[11px] uppercase tracking-[0.16em] scroll-slim sm:px-6",
        className,
      )}
    >
      <a
        href={HOUSE_URL}
        target="_blank"
        rel="noopener"
        className="tap inline-flex shrink-0 items-center text-[10px] tracking-[0.2em] text-house-gold transition-opacity hover:opacity-80"
      >
        Northern Lantern House Labs
      </a>
      <span aria-hidden className="hidden h-px w-6 shrink-0 bg-border-strong sm:block" />
      <span className="shrink-0 text-subtle">{t("nav.brand")}</span>

      <nav
        className="flex min-w-0 items-center gap-x-4 sm:ml-2"
        aria-label={t("nav.sections")}
      >
        {LINKS.map((l) => {
          const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
          return (
            <Link
              key={l.to}
              to={l.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "tap inline-flex shrink-0 items-center transition-colors duration-300",
                active
                  ? "text-primary underline decoration-primary/50 decoration-1 underline-offset-8"
                  : "text-subtle hover:text-foreground",
              )}
            >
              {t(l.key)}
              {l.to === "/shortlist" && slugs.length ? (
                <span className="text-num ml-1.5 text-primary">{slugs.length}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto shrink-0 pl-4">
        <DisplayPill />
      </div>
    </div>
  );
}
