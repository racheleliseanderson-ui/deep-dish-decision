import { depthNextStep, depthSentence, readRegionDepth } from "@/lib/region-depth";
import { cn } from "@/lib/utils";

/**
 * The real depth of the place the reader has chosen, before they invest a
 * search in it. Says the number, says why the number is what it is, and stops.
 * No apology, because there is nothing here to apologise for.
 */
export function RegionDepth({
  region,
  group,
  onWiden,
  className,
}: {
  region: string | null;
  group: string | null;
  onWiden?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const read = readRegionDepth(region, group);
  if (!read) return null;
  const next = depthNextStep(read);
  const lean = read.band === "single" || read.band === "shallow";

  return (
    <p
      className={cn(
        "rounded-xl border px-4 py-3 text-[13px] leading-relaxed",
        lean
          ? "border-watch/35 bg-watch/8 text-muted-foreground"
          : "border-border bg-surface-raised/60 text-muted-foreground",
        className,
      )}
    >
      {depthSentence(read)}
      {next ? (
        onWiden ? (
          <>
            {" "}
            <button
              type="button"
              onClick={onWiden}
              className="tap underline underline-offset-2 hover:text-foreground"
            >
              {next}
            </button>
          </>
        ) : (
          ` ${next}`
        )
      ) : null}
    </p>
  );
}
