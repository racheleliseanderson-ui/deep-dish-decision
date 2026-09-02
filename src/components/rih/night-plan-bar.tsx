import { useShortlist } from "@/lib/shortlist";
import { titleForSlug } from "@/lib/corpus-meta";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/** Always-visible browser-local Night Plan bar. */
export function NightPlanBar() {
  const shortlist = useShortlist();
  const count = shortlist.slugs.length;
  const titles = shortlist.slugs
    .map((s) => titleForSlug(s))
    .filter(Boolean)
    .slice(0, 3) as string[];
  const [copied, setCopied] = useState(false);
  const [hasQuery, setHasQuery] = useState(false);

  useEffect(() => {
    setHasQuery(window.location.search.length > 1);
  }, []);

  const onCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () =>
      document.documentElement.style.setProperty("--night-bar-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--night-bar-h");
    };
  }, []);

  return (
    <div
      ref={barRef}
      className={cn(
        "no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md",
        "px-4 py-2.5 sm:px-6",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {count === 0 ? (
            <p className="truncate text-[12px] text-muted-foreground">
              Night plan is empty — save a restaurant from your results.
            </p>
          ) : (
            <p className="truncate text-[12px] text-muted-foreground">
              <span className="text-num text-foreground">{count}</span> in the night plan
              {titles.length ? <span className="text-subtle"> · {titles.join(" · ")}</span> : null}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasQuery ? (
            <button
              type="button"
              onClick={onCopyUrl}
              className={cn(
                "tap rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors",
                copied
                  ? "border-verified/45 bg-verified-soft text-verified"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          ) : null}
          <Link
            to="/"
            hash="ranked"
            className="tap rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:border-border-strong hover:text-foreground"
          >
            Results
          </Link>
          <Link
            to="/shortlist"
            className={cn(
              "tap rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors",
              count
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            Night plan{count ? ` · ${count}` : ""}
          </Link>
        </div>
      </div>
    </div>
  );
}
