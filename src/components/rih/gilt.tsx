import { useReveal } from "@/components/rih/reveal";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Brass hairline that draws itself in when the section arrives. */
export function GiltRule({ className }: { className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("w-full overflow-hidden", className)} aria-hidden>
      <div
        className="gilt-rule origin-left transition-transform duration-[1200ms] ease-instrument"
        style={{ transform: shown ? "scaleX(1)" : "scaleX(0)" }}
      />
    </div>
  );
}

/** Plate-glass display case. Content sits behind a gilt hairline and sheen. */
export function Vitrine({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("vitrine", className)}>{children}</div>;
}

/**
 * Numbered chapter header — index, eyebrow, gilt rule, display line. The index
 * is the composition device: it fixes the reading order of the page.
 */
export function Plinth({
  index,
  eyebrow,
  title,
  lede,
  aside,
  className,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4">
        <span className="text-num shrink-0 text-[11px] tracking-[0.2em] text-gilt">{index}</span>
        <span className="text-eyebrow truncate">{eyebrow}</span>
      </div>
      <GiltRule className="mt-3" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
        <h2 className="display-chapter min-w-0">{title}</h2>
        {aside ? <div className="min-w-0 lg:text-right">{aside}</div> : null}
      </div>
      {lede ? (
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{lede}</p>
      ) : null}
    </div>
  );
}

/** Counts a figure up once, on arrival. Tabular so nothing shifts while it runs. */
export function Figure({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const { ref, shown } = useReveal<HTMLSpanElement>();
  const [n, setN] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!shown) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    const start = performance.now();
    const dur = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [shown, value]);

  return (
    <span ref={ref} className={cn("text-num tabular-nums", className)}>
      {n}
      {suffix}
    </span>
  );
}

/** Thin corpus ticker. Duplicated once so the loop is seamless. */
export function Marquee({ items }: { items: string[] }) {
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden border-y border-border-strong bg-marble/60 py-2.5"
      aria-hidden
    >
      <div className="marquee-track gap-10">
        {row.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="flex shrink-0 items-center gap-10 whitespace-nowrap text-[11px] uppercase tracking-[0.18em] text-subtle"
          >
            {t}
            <span className="size-1 rounded-full bg-gilt" />
          </span>
        ))}
      </div>
    </div>
  );
}
