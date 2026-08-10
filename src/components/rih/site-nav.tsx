import { Link, useRouterState } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/rih/theme-toggle";
import { useShortlist } from "@/lib/shortlist";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", label: "Instrument" },
  { to: "/atlas", label: "Atlas" },
  { to: "/shortlist", label: "Night plan" },
] as const;

export function SiteNav({ className }: { className?: string }) {
  const { slugs } = useShortlist();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className={cn(
        "no-print flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.16em]",
        className,
      )}
      aria-label="Sections"
    >
      <span className="text-eyebrow">Salty &amp; Clever</span>
      <span className="h-px w-8 bg-border-strong" />
      {LINKS.map((l) => {
        const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
        return (
          <Link
            key={l.to}
            to={l.to}
            className={cn(
              "transition-colors duration-300",
              active ? "text-primary" : "text-subtle hover:text-foreground",
            )}
          >
            {l.label}
            {l.to === "/shortlist" && slugs.length ? (
              <span className="text-num ml-1.5 text-primary">{slugs.length}</span>
            ) : null}
          </Link>
        );
      })}
      <ThemeToggle className="ml-auto" />
    </nav>
  );
}
