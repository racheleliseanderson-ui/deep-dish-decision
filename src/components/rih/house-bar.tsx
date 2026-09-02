import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { DisplayControls } from "@/components/rih/display-controls";
import { HEADER_NAV_LINKS } from "@/components/rih/nav-links";
import { useT } from "@/lib/i18n";
import { useShortlist } from "@/lib/shortlist";
import { cn } from "@/lib/utils";

/**
 * House bar — Northern Lantern House Labs wordmark, the publication, the app
 * nav and a compact display pill.
 *
 * Below `md` the nav collapses into a disclosure so the bar never becomes a
 * horizontal scroller and the Display control stays reachable on a phone.
 */

const LINKS = HEADER_NAV_LINKS;

export const HOUSE_URL = "https://northernlanternhouse.com";

function DisplayPill({ id }: { id: string }) {
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className="tap inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-raised/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Display settings"
        aria-haspopup="dialog"
      >
        Display
        <span aria-hidden className="text-[9px]">
          ▾
        </span>
      </button>
      <div
        id={id}
        popover="auto"
        className="no-print rounded-2xl border border-border bg-popover p-3 shadow-lift"
        style={{
          inset: "auto",
          top: "3.25rem",
          right: "1rem",
          width: "min(20rem, calc(100vw - 2rem))",
        }}
      >
        <DisplayControls />
      </div>
    </>
  );
}

function NavItems({ onNavigate, stacked = false }: { onNavigate?: () => void; stacked?: boolean }) {
  const { slugs } = useShortlist();
  const { t } = useT();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      {LINKS.map((l) => {
        const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
        return (
          <Link
            key={l.to}
            to={l.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "tap inline-flex shrink-0 items-center transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              stacked && "w-full justify-between rounded-lg px-3 py-2.5 hover:bg-surface-raised/60",
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
    </>
  );
}

export function HouseBar({ className }: { className?: string }) {
  const { slugs } = useShortlist();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the mobile sheet on Escape or on a click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  return (
    <div ref={panelRef} className={cn("no-print relative", className)}>
      <div className="flex min-w-0 items-center gap-x-4 px-4 py-3 text-[11px] uppercase tracking-[0.16em] sm:px-6">
        <a
          href={HOUSE_URL}
          target="_blank"
          rel="noopener"
          className="tap inline-flex min-w-0 items-center truncate text-[10px] tracking-[0.2em] text-house-gold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Northern Lantern House Labs
        </a>
        <span aria-hidden className="hidden h-px w-6 shrink-0 bg-border-strong lg:block" />
        <span className="hidden shrink-0 text-subtle lg:inline">{t("nav.brand")}</span>

        {/* Desktop nav */}
        <nav
          className="ml-2 hidden min-w-0 items-center gap-x-4 md:flex"
          aria-label={t("nav.sections")}
        >
          <NavItems />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <div className="hidden md:block">
            <DisplayPill id="display-controls-popover" />
          </div>

          {/* Mobile disclosure */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="house-bar-mobile-nav"
            className="tap inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <span aria-hidden className="grid gap-[3px]">
              <span className="block h-px w-3.5 bg-current" />
              <span className="block h-px w-3.5 bg-current" />
              <span className="block h-px w-3.5 bg-current" />
            </span>
            Menu
            {slugs.length ? <span className="text-num text-primary">{slugs.length}</span> : null}
          </button>
        </div>
      </div>

      <div
        id="house-bar-mobile-nav"
        hidden={!open}
        className="absolute inset-x-0 top-full z-50 border-y border-border bg-popover px-4 py-3 shadow-lift md:hidden"
      >
        <nav
          className="flex flex-col gap-0.5 text-[11px] uppercase tracking-[0.16em]"
          aria-label={t("nav.sections")}
        >
          <NavItems stacked onNavigate={() => setOpen(false)} />
        </nav>
        <div className="mt-3 border-t border-border pt-3">
          <DisplayControls />
        </div>
      </div>
    </div>
  );
}
