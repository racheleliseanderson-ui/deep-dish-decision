import { COMMITMENT_LEVELS, PLANNING_LEVELS, SPEND_BANDS, type Situation } from "@/lib/intelligence";
import { corpusMeta } from "@/lib/corpus-meta";
import { cn } from "@/lib/utils";

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "tap rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/12 text-foreground"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function RefineNight({
  situation,
  patch,
}: {
  situation: Situation;
  patch: (next: Partial<Situation>) => void;
}) {
  return (
    <details className="mt-6 rounded-2xl border border-border bg-surface-sunken/45">
      <summary className="tap cursor-pointer list-none px-5 py-4 text-sm font-medium text-foreground marker:hidden sm:px-6">
        <span className="flex items-center justify-between gap-4">
          <span>
            Refine this night
            <span className="ml-2 font-normal text-muted-foreground">Party · budget · cuisine · distance · planning · commitment · wine</span>
          </span>
          <span aria-hidden className="text-primary">+</span>
        </span>
      </summary>

      <div className="grid gap-6 border-t border-border px-5 py-5 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-eyebrow">Party size</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <Toggle
                key={n}
                active={situation.partySize === n}
                onClick={() => patch({ partySize: situation.partySize === n ? null : n })}
              >
                {n}
              </Toggle>
            ))}
          </div>
        </div>

        <div>
          <p className="text-eyebrow">Budget</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPEND_BANDS.map((band) => (
              <Toggle
                key={band}
                active={situation.spendBand === band}
                onClick={() => patch({ spendBand: situation.spendBand === band ? null : band })}
              >
                {band}
              </Toggle>
            ))}
          </div>
        </div>

        <label>
          <span className="text-eyebrow">Cuisine</span>
          <select
            value={situation.cuisine ?? ""}
            onChange={(e) => patch({ cuisine: e.target.value || null })}
            className="mt-2 w-full rounded-xl border border-border bg-background/35 px-3 py-2.5 text-sm text-foreground"
          >
            <option value="">Any cuisine</option>
            {corpusMeta.cuisineTagOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-eyebrow">Distance</p>
          {situation.origin ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 3, 5, 10, 25].map((miles) => (
                <Toggle
                  key={miles}
                  active={situation.radiusMi === miles}
                  onClick={() => patch({ radiusMi: situation.radiusMi === miles ? null : miles })}
                >
                  {miles} mi
                </Toggle>
              ))}
              <Toggle active={situation.radiusMi === null} onClick={() => patch({ radiusMi: null })}>
                Any distance
              </Toggle>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-subtle">Use “Near me” in the four-question start to make distance a hard filter.</p>
          )}
        </div>

        <div>
          <p className="text-eyebrow">Planning tolerance</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLANNING_LEVELS.map((value) => (
              <Toggle
                key={value}
                active={situation.maxPlanningLoad === value}
                onClick={() => patch({ maxPlanningLoad: situation.maxPlanningLoad === value ? null : value })}
              >
                {value}
              </Toggle>
            ))}
          </div>
        </div>

        <div>
          <p className="text-eyebrow">Commitment</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {COMMITMENT_LEVELS.map((value) => (
              <Toggle
                key={value}
                active={situation.maxCommitment === value}
                onClick={() => patch({ maxCommitment: situation.maxCommitment === value ? null : value })}
              >
                {value}
              </Toggle>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <p className="text-eyebrow">Preferences</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Toggle active={situation.preferWalkIn} onClick={() => patch({ preferWalkIn: !situation.preferWalkIn })}>
              Walk-in preferred
            </Toggle>
            <Toggle active={situation.wineForward} onClick={() => patch({ wineForward: !situation.wineForward })}>
              Wine-forward
            </Toggle>
            <Toggle active={situation.openOnly} onClick={() => patch({ openOnly: !situation.openOnly })}>
              Only rooms serving then
            </Toggle>
          </div>
        </div>
      </div>
    </details>
  );
}
