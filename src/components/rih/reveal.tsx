import { useEffect, useRef, useState, type ReactNode } from "react";
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
}: {
  value: number;
  tone?: "primary" | "critical" | "watch" | "unknown" | "verified";
  className?: string;
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
  return (
    <div
      ref={ref}
      className={cn("h-[5px] w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-instrument", bg)}
        style={{ width: shown ? `${Math.max(2, Math.min(100, value))}%` : "0%" }}
      />
    </div>
  );
}
