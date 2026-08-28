import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { DockCoach, MobileDock, navIsActive, PRIMARY_NAV, RouteCue } from "@/components/mobile-nav";
import { Button } from "@/components/ui";
import { loadPasses } from "@/lib/storage";
import { useNight } from "@/lib/store";
import { cn } from "@/lib/utils";

function ThemeControls({
  theme,
  cvd,
  onTheme,
  onCvd,
}: {
  theme: "navy" | "pearl";
  cvd: boolean;
  onTheme: () => void;
  onCvd: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        className="px-3 text-xs uppercase tracking-widest"
        aria-pressed={theme === "navy"}
        aria-label={
          theme === "navy" ? "Theme: navy. Switch to pearl." : "Theme: pearl. Switch to navy."
        }
        onClick={onTheme}
      >
        {theme === "navy" ? "Navy" : "Pearl"}
      </Button>
      <Button
        variant="ghost"
        className="px-3 text-xs uppercase tracking-widest"
        aria-pressed={cvd}
        aria-label={cvd ? "Color vision mode on. Turn off." : "Color vision mode off. Turn on."}
        onClick={onCvd}
      >
        CVD
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const store = useNight();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const passCount = store.hydrated ? store.passes.length : loadPasses().length;

  useEffect(() => {
    store.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash) return;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-background pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] text-foreground sm:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top,0px))] focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            aria-label="Deep Dish home"
            className="tap inline-flex min-h-11 shrink-0 items-center rounded-lg px-1"
          >
            <span className="font-display text-xl tracking-tight">Deep Dish</span>
            <span className="ml-2 hidden text-eyebrow text-gilt sm:inline">Confirm, then book</span>
          </Link>
          <nav
            aria-label="Primary"
            className="ml-auto hidden min-w-0 items-center gap-1 text-xs uppercase tracking-widest sm:flex"
          >
            {PRIMARY_NAV.map((l) => {
              const active = navIsActive(pathname, l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "tap inline-flex items-center px-2.5",
                    active ? "text-primary" : "text-subtle hover:text-foreground",
                  )}
                >
                  {l.label}
                  {l.to === "/nights" && passCount ? (
                    <span className="text-num ml-1 text-primary">{passCount}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="hidden sm:block">
            <ThemeControls
              theme={store.theme}
              cvd={store.cvd}
              onTheme={() => store.setTheme(store.theme === "navy" ? "pearl" : "navy")}
              onCvd={() => store.setCvd(!store.cvd)}
            />
          </div>
        </div>
      </header>
      <RouteCue />
      <div id="main" tabIndex={-1} className="outline-none">
        {children}
      </div>
      <footer className="no-print border-t border-border px-4 py-8 text-xs text-subtle sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Salty & Clever · first-party evidence · unknowns stay open · no allergen guarantee.</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="sm:hidden">
              <ThemeControls
                theme={store.theme}
                cvd={store.cvd}
                onTheme={() => store.setTheme(store.theme === "navy" ? "pearl" : "navy")}
                onCvd={() => store.setCvd(!store.cvd)}
              />
            </div>
            <p>Work stays on this device. Nothing is sent unless you print or copy it.</p>
          </div>
        </div>
      </footer>
      <DockCoach />
      <MobileDock passCount={passCount} />
    </div>
  );
}
