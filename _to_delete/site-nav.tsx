// Not rendered anywhere. src/components/rih/nav-links.ts is the source of
// truth for navigation; edit that, not this file.
import { Link, useRouterState } from "@tanstack/react-router";
import { DisplayControls } from "@/components/rih/display-controls";
import { useT } from "@/lib/i18n";
import { useShortlist } from "@/lib/shortlist";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", key: "nav.instrument" },
  { to: "/guide", key: "nav.guide" },
  { to: "/atlas", key: "nav.atlas" },
  { to: "/console", key: "nav.console" },
  { to: "/shortlist", key: "nav.shortlist" },
] as const;

const SUITE = [
  { href: "https://salty.saltnotes.blog/", label: "Desk" },
  { href: "https://kitchen.saltnotes.blog/", label: "Kitchen" },
  { href: "https://occasion.saltnotes.blog/architecture", label: "Menu" },
  { href: "https://occasion.saltnotes.blog/", label: "Occasion" },
  { href: "https://deepdish.saltnotes.blog/", label: "RI", current: true },
] as const;

export function SiteNav({ className }: { className?: string }) {
  const { slugs } = useShortlist();
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className={cn("no-print flex flex-col gap-3", className)}>
      <nav
        className="-mx-1 flex min-w-0 items-center gap-x-3 gap-y-2 overflow-x-auto px-1 text-[11px] uppercase tracking-[0.16em] scroll-slim"
        aria-label="Salty & Clever suite"
      >
        <span className="text-eyebrow shrink-0 text-gilt">Suite</span>
        <span className="hidden h-px w-6 shrink-0 bg-border-strong sm:block" />
        {SUITE.map((item) => {
          const current = "current" in item && item.current;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "tap inline-flex shrink-0 items-center transition-colors duration-300",
                current
                  ? "text-primary underline decoration-primary/50 decoration-1 underline-offset-8"
                  : "text-subtle hover:text-foreground",
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <nav
          className="-mx-1 flex min-w-0 flex-1 items-center gap-x-4 gap-y-2 overflow-x-auto px-1 text-[11px] uppercase tracking-[0.16em] scroll-slim sm:flex-wrap sm:overflow-visible"
          aria-label={t("nav.sections")}
        >
          <span className="text-eyebrow shrink-0">{t("nav.brand")}</span>
          <span className="hidden h-px w-8 shrink-0 bg-border-strong sm:block" />
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
        <DisplayControls className="sm:ml-auto sm:shrink-0" />
      </div>
    </div>
  );
}