import { useShortlist } from "@/lib/shortlist";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Always-visible slim bar: night plan count + deep-link to ranked rooms. */
export function NightPlanBar() {
  const shortlist = useShortlist();
  const n = shortlist.slugs.length;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <p className="text-eyebrow truncate">Night plan</p>
          <p className="text-[13px] text-muted-foreground">
            {n === 0
              ? "No rooms shortlisted yet — open a card and add."
              : `${n} room${n === 1 ? "" : "s"} on the plan`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="#ranked"
            className="tap rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            Rooms
          </a>
          <Link
            to="/shortlist"
            className={cn(
              "tap rounded-full px-3.5 py-1.5 text-xs font-medium transition-opacity",
              n > 0
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "border border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            Open plan{n > 0 ? ` · ${n}` : ""}
          </Link>
        </div>
      </div>
    </div>
  );
}
