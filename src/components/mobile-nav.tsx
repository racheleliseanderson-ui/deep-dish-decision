import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Files, House, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const HINT_KEY = "deepdish.dockHint.v1";

export const PRIMARY_NAV = [
  { to: "/", label: "Start", short: "Start", icon: House },
  { to: "/night", label: "The night", short: "Night", icon: Moon },
  { to: "/nights", label: "Records", short: "Records", icon: Files },
  { to: "/guide", label: "Method", short: "Method", icon: BookOpen },
] as const;

export const MOBILE_STEPS = [
  {
    n: "01",
    t: "Start",
    tap: "Tap Start.",
    d: "Load a demonstration, or begin a blank night from scratch.",
    next: "Night.",
  },
  {
    n: "02",
    t: "The night",
    tap: "Tap Night.",
    d: "Declare the situation. Ranking updates as the constraints land.",
    next: "Open a room from the ranking.",
  },
  {
    n: "03",
    t: "A room",
    tap: "Not a button on the bar.",
    d: "Open a record from the ranking. Run the confirmation pass before you book.",
    next: "Records, once the packet is verified.",
  },
  {
    n: "04",
    t: "Records",
    tap: "Tap Records.",
    d: "The verified packet stays on this device until you print or copy it.",
    next: "Print or copy. Nothing is sent.",
  },
] as const;

export function navIsActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/night") return pathname === "/night" || pathname.startsWith("/compare");
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function cueFor(pathname: string): {
  n: string;
  title: string;
  next: string;
  nextTo?: "/" | "/night" | "/nights" | "/guide";
} | null {
  if (pathname === "/" || pathname.startsWith("/guide")) return null;
  if (pathname === "/night") {
    return { n: "02", title: "The night", next: "Open a room from the ranking." };
  }
  if (pathname.startsWith("/compare")) {
    return { n: "02", title: "Compare", next: "Return to Night, then open a room.", nextTo: "/night" };
  }
  if (pathname.startsWith("/record/")) {
    return { n: "03", title: "A room", next: "Run the confirmation pass." };
  }
  if (pathname.startsWith("/confirm/")) {
    return { n: "03", title: "Confirmation pass", next: "Records, once verified.", nextTo: "/nights" };
  }
  if (pathname.startsWith("/nights") || pathname.startsWith("/packet/")) {
    return { n: "04", title: "Records", next: "Print or copy. It stays on this device." };
  }
  return null;
}

export function RouteCue() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cue = cueFor(pathname);
  if (!cue) return null;

  return (
    <div
      className="no-print border-b border-border bg-surface-sunken/60 sm:hidden"
      aria-label="Where you are"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-3 px-4 py-2.5">
        <p className="min-w-0 truncate">
          <span className="text-num text-gilt">{cue.n}</span>{" "}
          <span className="font-display text-lg tracking-tight">{cue.title}</span>
        </p>
        {cue.nextTo ? (
          <Link
            to={cue.nextTo}
            className="tap inline-flex min-h-11 shrink-0 items-center text-xs text-primary underline underline-offset-2"
          >
            Next: {cue.next}
          </Link>
        ) : (
          <p className="min-w-0 basis-1/2 text-right text-xs leading-snug text-muted-foreground">
            Next: {cue.next}
          </p>
        )}
      </div>
    </div>
  );
}

export function MobileDock({ passCount }: { passCount: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Four-stop map"
      className="no-print fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-4 right-24 z-40 grid grid-cols-4 gap-0.5 rounded-2xl border border-border-strong bg-surface-raised p-1 shadow-plate sm:hidden"
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        const active = navIsActive(pathname, item.to);
        const count = item.to === "/nights" && passCount ? `, ${passCount} packets` : "";
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-label={`${item.label}${count}${active ? ", current stop" : ""}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "tap flex min-h-12 flex-col items-center justify-center rounded-xl px-1",
              active ? "bg-gilt-soft text-gilt" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span className="mt-0.5 font-mono text-xs uppercase leading-none tracking-widest" aria-hidden>
              {item.short}
              {item.to === "/nights" && passCount ? (
                <span className="text-num ml-0.5 text-primary">{passCount}</span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DockCoach() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(HINT_KEY) === "1") {
      setShow(false);
      return;
    }
    setShow(pathname !== "/");
  }, [pathname]);

  if (!show) return null;

  const dismiss = () => {
    window.localStorage.setItem(HINT_KEY, "1");
    setShow(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="How you move on a phone"
      className="no-print mx-auto mb-4 max-w-6xl px-4 sm:hidden"
    >
      <div className="plate p-3">
        <p className="font-display text-lg leading-tight tracking-tight">Four stops. Same bar.</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Start → Night → a room → Records. A room is not a button. Method is the written map.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="tap inline-flex items-center px-1 text-xs uppercase tracking-widest text-primary"
            onClick={dismiss}
          >
            Dismiss
          </button>
          <Link
            to="/guide"
            className="tap inline-flex items-center text-xs text-muted-foreground underline underline-offset-2"
            onClick={dismiss}
          >
            Read the map
          </Link>
        </div>
      </div>
    </div>
  );
}

function BarLegend() {
  return (
    <nav
      aria-label="Four-stop map, as a legend"
      className="mt-5 grid grid-cols-4 gap-0.5 rounded-2xl border border-border-strong bg-surface-raised p-1"
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className="tap flex min-h-12 flex-col items-center justify-center rounded-xl px-1 text-muted-foreground"
          >
            <Icon className="size-5" aria-hidden />
            <span className="mt-0.5 font-mono text-xs uppercase leading-none tracking-widest" aria-hidden>
              {item.short}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileHowTo({ className, full }: { className?: string; full?: boolean }) {
  return (
    <section className={cn("scroll-mt-24", className)} id="how-you-move">
      <p className="text-eyebrow text-gilt">How you move</p>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Four stops. Same bar, every screen.</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        On a phone the map is the bar at the bottom — Start, Night, Records, Method — kept clear of the
        right-hand edge so a thumb can reach it. On a laptop the same four live in the top bar.
      </p>
      <BarLegend />
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        The night itself runs Start → Night → a room → Records. A room is not a button. You open it from
        the ranking, then the confirmation pass writes into Records. Method is the written map, not a
        stop in the night.
      </p>
      <ol className="mt-6 grid gap-5 sm:grid-cols-2">
        {MOBILE_STEPS.map((step) => (
          <li key={step.n} className="min-w-0">
            <p className="text-num text-gilt">{step.n}</p>
            <h3 className="mt-1 font-display text-xl tracking-tight">{step.t}</h3>
            <p className="mt-1 text-sm font-medium text-foreground">{step.tap}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.d}</p>
            <p className="mt-1 text-xs text-subtle">Next: {step.next}</p>
          </li>
        ))}
      </ol>
      {full ? (
        <div className="mt-8 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Compare is not a stop of its own. Hold rooms from Night, then open Compare from there.</p>
          <p>
            Theme and CVD sit in the footer on a phone, and in the header on a laptop. Work stays on
            this device. Nothing is sent unless you print or copy it.
          </p>
          <p>If you lose the sequence: tap Method. This page is the map. Then tap Night and keep going.</p>
        </div>
      ) : null}
    </section>
  );
}
