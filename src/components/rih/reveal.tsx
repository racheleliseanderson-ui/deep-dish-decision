import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** Scroll-driven reveal. Respects reduced motion by resolving immediately. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <As
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-[900ms] ease-instrument will-change-transform",
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-6 opacity-0 blur-[2px]",
        className,
      )}
    >
      {children}
    </As>
  );
}

/** Horizontal bar that grows once in view — used across the atlas tables. */
export function GrowBar({
  value,
  tone = "primary",
  className,
  /** When true, always animate from current width (situation live updates). */
  live = false,
}: {
  value: number;
  tone?: "primary" | "critical" | "watch" | "unknown" | "verified";
  className?: string;
  live?: boolean;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const bg =
    tone === "critical"
      ? "bg-critical"
      : tone === "watch"
        ? "bg-watch"
        : tone === "unknown"
          ? "bg-unknown"
          : tone === "verified"
            ? "bg-verified"
            : "bg-primary";
  const ready = live || shown;
  return (
    <div
      ref={ref}
      className={cn("h-[5px] w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-instrument", bg)}
        style={{ width: ready ? `${Math.max(2, Math.min(100, value))}%` : "0%" }}
      />
    </div>
  );
}

/**
 * FLIP slot for ranked cards. When rank order changes, the card glides from its
 * previous screen position instead of hard-swapping. First paint is a no-op so
 * Reveal still owns the entrance.
 */
export function RankSlot({
  id,
  rank,
  children,
  className,
}: {
  id: string;
  rank: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<{ top: number; rank: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prev.current) {
      prev.current = { top: rect.top, rank };
      return;
    }

    if (reduced) {
      prev.current = { top: rect.top, rank };
      return;
    }

    const dy = prev.current.top - rect.top;
    const rankChanged = prev.current.rank !== rank;

    if (Math.abs(dy) > 2) {
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      el.style.opacity = "0.88";
      void el.offsetWidth;
      el.style.transition =
        "transform 560ms cubic-bezier(0.16, 1, 0.3, 1), opacity 420ms cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.transform = "";
      el.style.opacity = "";
    } else if (rankChanged) {
      el.classList.remove("rank-flash");
      void el.offsetWidth;
      el.classList.add("rank-flash");
    }

    prev.current = { top: rect.top, rank };
  }, [rank, id]);

  const style = { viewTransitionName: `rank-${id}` } as CSSProperties;

  return (
    <div
      ref={ref}
      className={cn("will-change-transform", className)}
      data-rank-slot={id}
      data-rank={rank}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Soft content swap when the key changes (lead restaurant, brief).
 * Children always render latest after the out-in handoff.
 */
export function FadeKey({
  k,
  children,
  className,
}: {
  k: string;
  children: ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(true);
  const [shownKey, setShownKey] = useState(k);
  const [shownBody, setShownBody] = useState(children);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      setShownKey(k);
      setShownBody(children);
      return;
    }
    if (k === shownKey) {
      setShownBody(children);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShownKey(k);
      setShownBody(children);
      setVisible(true);
      return;
    }
    setVisible(false);
    const t = window.setTimeout(() => {
      setShownKey(k);
      setShownBody(children);
      setVisible(true);
    }, 150);
    return () => window.clearTimeout(t);
  }, [k, children, shownKey]);

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-instrument",
        visible ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
        className,
      )}
    >
      {shownBody}
    </div>
  );
}
