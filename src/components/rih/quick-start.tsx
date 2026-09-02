import { corpusMeta } from "@/lib/corpus-meta";
import type { Constraint, Occasion, Situation } from "@/lib/intelligence";
import type { OriginState } from "@/lib/origin";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

const NIGHTS: { label: string; value: Occasion | null }[] = [
  { label: "Date", value: "Date night" },
  { label: "Celebration", value: "Celebration" },
  { label: "Business", value: "Business dining" },
  { label: "Group", value: "Group dining" },
  { label: "Casual / weeknight", value: "Local / low-stakes weeknight" },
  { label: "Walk-in", value: "Walk-in / spontaneous" },
  { label: "Something else", value: null },
];

const HARD_CONSTRAINTS: { label: string; value: Constraint }[] = [
  { label: "Allergy / celiac", value: "Severe allergy / celiac" },
  { label: "Accessibility", value: "Mobility / step-free needs" },
  { label: "Hard budget", value: "Hard budget cap" },
  { label: "Need quiet", value: "Hearing / noise sensitivity" },
  { label: "Hard end time", value: "Hard end time (show, train, childcare)" },
  { label: "Large group", value: "Large party (6+)" },
  { label: "Private room", value: "Private / semi-private required" },
  { label: "Zero-proof", value: "Zero-proof / no alcohol" },
];

type Place = {
  label: string;
  city: string;
  region: string;
  regionGroup: string;
};

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function localIso(date: Date) {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return copy.toISOString().slice(0, 10);
}

function dateFromLeadDays(days: number | null) {
  if (days === null) return "";
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return localIso(d);
}

function leadDaysFromDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d, 12, 0, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

function Choice({
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
        "tap rounded-full border px-3.5 py-2 text-sm transition-colors",
        active
          ? "border-primary bg-primary/12 text-foreground"
          : "border-border bg-background/20 text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function QuickStart({
  situation,
  onChange,
  originState,
  nearMeResolving,
  nearMeError,
  onSubmit,
}: {
  situation: Situation;
  onChange: (next: Situation) => void;
  originState: OriginState;
  nearMeResolving: boolean;
  nearMeError: string | null;
  onSubmit: () => void;
}) {
  const places = useMemo<Place[]>(() => {
    const unique = new Map<string, Place>();
    for (const entry of corpusMeta.slugIndex) {
      if (!entry.city || !entry.regionGroup) continue;
      const label = `${entry.city}, ${entry.regionGroup}`;
      if (!unique.has(label)) {
        unique.set(label, {
          label,
          city: entry.city,
          region: entry.region,
          regionGroup: entry.regionGroup,
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const [locationText, setLocationText] = useState(() => situation.region || "");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState(() => dateFromLeadDays(situation.leadDays));
  const [otherNight, setOtherNight] = useState(false);
  const [constraintAnswered, setConstraintAnswered] = useState(situation.constraints.length > 0);

  useEffect(() => {
    if (situation.region && !locationText) setLocationText(situation.region);
  }, [situation.region, locationText]);

  const findPlace = (raw: string): Place | null => {
    const q = norm(raw);
    if (!q) return null;

    const exact = places.find(
      (p) => norm(p.label) === q || norm(p.city) === q || norm(p.region) === q,
    );
    if (exact) return exact;

    const chunks = raw
      .split(",")
      .map((x) => norm(x))
      .filter(Boolean)
      .reverse();
    for (const chunk of chunks) {
      const hit = places.find(
        (p) => norm(p.city) === chunk || norm(p.label).startsWith(`${chunk},`) || norm(p.region).includes(chunk),
      );
      if (hit) return hit;
    }

    return (
      places.find((p) => norm(p.label).startsWith(q)) ??
      places.find((p) => norm(p.label).includes(q)) ??
      null
    );
  };

  const commitPlace = () => {
    if (!locationText.trim()) return Boolean(situation.regionGroup);
    const place = findPlace(locationText);
    if (!place) {
      setLocationError("Choose a city from the suggestions so Deep Dish knows which regional file to load.");
      return false;
    }

    originState.clear();
    setLocationError(null);
    setLocationText(place.label);
    onChange({
      ...situation,
      regionGroup: place.regionGroup,
      region: place.region,
      origin: null,
      originLabel: null,
      radiusMi: null,
      query: "",
    });
    return true;
  };

  const selectNight = (value: Occasion | null, label: string) => {
    setOtherNight(value === null && label === "Something else");
    onChange({
      ...situation,
      occasion: value,
      preferWalkIn: value === "Walk-in / spontaneous" ? true : situation.preferWalkIn,
    });
  };

  const toggleConstraint = (value: Constraint) => {
    setConstraintAnswered(true);
    const exists = situation.constraints.includes(value);
    onChange({
      ...situation,
      constraints: exists
        ? situation.constraints.filter((x) => x !== value)
        : [...situation.constraints, value],
    });
  };

  const submit = () => {
    if (!situation.regionGroup && originState.origin?.kind !== "device") {
      if (!commitPlace()) return;
    } else if (locationText.trim() && originState.origin?.kind !== "device") {
      if (!commitPlace()) return;
    }
    if (nearMeResolving) return;
    onSubmit();
  };

  const nearMeActive = originState.origin?.kind === "device";

  return (
    <section id="situation" className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5 shadow-lift sm:p-7 lg:p-8">
      <div className="max-w-2xl">
        <p className="text-eyebrow text-gilt">Four questions</p>
        <h2 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
          What does this night actually need?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Start here. Deep Dish can refine the answer later; it does not need eleven inputs before it can help.
        </p>
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-2">
        <fieldset>
          <legend className="font-display text-xl">1. Where?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            <Choice
              active={nearMeActive}
              onClick={() => {
                setLocationError(null);
                setLocationText("");
                onChange({
                  ...situation,
                  region: null,
                  regionGroup: null,
                  origin: null,
                  originLabel: null,
                  radiusMi: null,
                });
                originState.request();
              }}
            >
              {originState.status === "asking" || nearMeResolving ? "Finding nearby restaurants…" : "Near me"}
            </Choice>
          </div>
          <label className="mt-3 block text-xs uppercase tracking-[0.14em] text-subtle" htmlFor="deep-dish-place">
            Or city / neighborhood
          </label>
          <input
            id="deep-dish-place"
            list="deep-dish-places"
            value={locationText}
            onChange={(e) => {
              setLocationText(e.target.value);
              setLocationError(null);
            }}
            onBlur={() => {
              if (locationText.trim()) commitPlace();
            }}
            placeholder="Portland, Oregon"
            className="mt-1.5 w-full rounded-xl border border-border bg-background/35 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary"
          />
          <datalist id="deep-dish-places">
            {places.map((place) => (
              <option key={place.label} value={place.label} />
            ))}
          </datalist>
          {nearMeActive && situation.regionGroup ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Using your location · nearest Deep Dish region: <span className="text-foreground">{situation.regionGroup}</span>
            </p>
          ) : null}
          {originState.status === "denied" ? (
            <p className="mt-2 text-xs text-watch">Location permission was declined. Pick a city instead.</p>
          ) : null}
          {nearMeError || locationError ? (
            <p className="mt-2 text-xs text-watch">{nearMeError || locationError}</p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="font-display text-xl">2. What kind of night?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {NIGHTS.map((item) => (
              <Choice
                key={item.label}
                active={item.value ? situation.occasion === item.value : otherNight}
                onClick={() => selectNight(item.value, item.label)}
              >
                {item.label}
              </Choice>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-display text-xl">3. When?</legend>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Choice
              active={situation.leadDays === 0}
              onClick={() => {
                const today = localIso(new Date());
                setDateValue(today);
                onChange({ ...situation, leadDays: 0 });
              }}
            >
              Tonight
            </Choice>
            <label className="min-w-[170px] flex-1">
              <span className="sr-only">Date</span>
              <input
                type="date"
                min={localIso(new Date())}
                value={dateValue}
                onChange={(e) => {
                  setDateValue(e.target.value);
                  onChange({ ...situation, leadDays: leadDaysFromDate(e.target.value) });
                }}
                className="w-full rounded-xl border border-border bg-background/35 px-3 py-2.5 text-sm text-foreground"
              />
            </label>
            <label className="min-w-[145px] flex-1">
              <span className="sr-only">Approximate seating time</span>
              <input
                type="time"
                value={situation.arriveAt ?? ""}
                onChange={(e) => onChange({ ...situation, arriveAt: e.target.value || null })}
                className="w-full rounded-xl border border-border bg-background/35 px-3 py-2.5 text-sm text-foreground"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-subtle">Date and approximate seating time are enough. Exact availability still gets confirmed with the restaurant.</p>
        </fieldset>

        <fieldset>
          <legend className="font-display text-xl">4. Anything that cannot go wrong?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {HARD_CONSTRAINTS.map((item) => (
              <Choice
                key={item.value}
                active={situation.constraints.includes(item.value)}
                onClick={() => toggleConstraint(item.value)}
              >
                {item.label}
              </Choice>
            ))}
            <Choice
              active={constraintAnswered && situation.constraints.length === 0}
              onClick={() => {
                setConstraintAnswered(true);
                onChange({ ...situation, constraints: [] });
              }}
            >
              Nothing critical
            </Choice>
          </div>
        </fieldset>
      </div>

      <div className="mt-8 border-t border-border pt-5">
        <button
          type="button"
          onClick={submit}
          disabled={nearMeResolving || originState.status === "asking"}
          className="tap inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          Find restaurants for this night
        </button>
      </div>
    </section>
  );
}
