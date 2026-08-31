import { useShortlist } from "@/lib/shortlist";
import { titleForSlug } from "@/lib/corpus-meta";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Always-visible slim bar for the night plan (browser-local shortlist).
 * Empty state invites the reader to the ranked rooms.
 * When the address bar already carries a situation query, expose a quick
 * "Copy link" that shares the current URL (no situation prop required).
 */
export function NightPlanBar() {
  const shortlist = useShortlist();
  const count = shortlist.slugs.length;
  const titles = shortlist.slugs
    .map((s) => titleForSlug(s))
    .filter(Boolean)
    .slice(0, 3) as string[];
  const [copied, setCopied] = useState(false);
  const [hasQuery, setHasQuery] = useState(false);

  // Client-only: avoid SSR/client mismatch on search params.
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

  return (
    <div
      className={cn(
        "no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md",
        "px-4 py-2.5 sm:px-6",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {count === 0 ? (
            <p className="truncate text-[12px] text-muted-foreground">
              Night plan is empty — add rooms from the ranked list.
            </p>
          ) : (
            <p className="truncate text-[12px] text-muted-foreground">
              <span className="text-num text-foreground">{count}</span> on the night plan
              {titles.length ? (
                <span className="text-subtle"> · {titles.join(" · ")}</span>
              ) : null}
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
          <a
            href="/#ranked"
            className="tap rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:border-border-strong hover:text-foreground"
          >
            Rooms
          </a>
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
