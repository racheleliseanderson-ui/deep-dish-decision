import { useShortlist } from "@/lib/shortlist";
import { bySlug } from "@/lib/dataset";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Always-visible slim bar for the night plan (browser-local shortlist).
 * Empty state invites the reader to the ranked rooms.
 */
export function NightPlanBar() {
  const shortlist = useShortlist();
  const count = shortlist.slugs.length;
  const titles = shortlist.slugs
    .map((s) => bySlug.get(s)?.title)
    .filter(Boolean)
    .slice(0, 3) as string[];

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
          <a
            href="/#ranked"
            className="tap rounded-full border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
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
