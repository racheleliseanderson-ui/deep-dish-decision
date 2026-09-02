import { ThemeToggle } from "@/components/rih/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Appearance only: Navy / Pearl plus the independent CVD overlay. Language is
 * English only.
 *
 * There used to be an "All sources / First-party only" segmented control here.
 * Ranking has always run on first-party evidence alone — scoreRecord accepts
 * the flag and discards it — so the control changed nothing a reader could see
 * and implied a second evidence layer that never reaches the score.
 */
export function DisplayControls({ className }: { className?: string }) {
  return (
    <div className={cn("no-print flex flex-wrap items-center gap-2", className)}>
      <ThemeToggle />
    </div>
  );
}
