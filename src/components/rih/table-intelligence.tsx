import { Eyebrow } from "@/components/rih/bits";
import type { LiveRow } from "@/lib/live";
import {
  bookingRiskLine,
  hoursProvenance,
  minutesToClock,
  openLabel,
  openStateAt,
  partyTotal,
  spendLine,
} from "@/lib/live";
import type { RestaurantRecord } from "@/lib/dataset";
import { cn } from "@/lib/utils";

/**
 * What the room is actually like.
 *
 * The dossier already carried the twelve-field evidence floor and the findings
 * stack, both written for an operator auditing a file. This panel answers the
 * questions a person asks before they book: what should we order, what is it
 * known for, what will it cost, when can we go, how do we get there, and what
 * do people consistently complain about.
 *
 * First-party statements, directory facts and recurring review patterns are
 * kept visibly apart in the markup, because they are kept apart in the scoring.
 */

/** A field counts as stated only when it carries content, not a placeholder. */
function stated(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^(not stated|not published|unstated|n\/a|—|-)$/i.test(v)) return null;
  if (/\b(not stated|not published|were not published|no .{0,30}recorded|not detailed)\b/i.test(v))
    return null;
  return v;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Panel({
  title,
  source,
  children,
  className,
}: {
  title: string;
  source?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface-sunken/45 p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-eyebrow">{title}</h3>
        {source ? (
          <p className="text-[10px] uppercase tracking-[0.12em] text-subtle">{source}</p>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function HoursGrid({ live, now }: { live: LiveRow; now: Date }) {
  const today = (() => {
    try {
      const wd = new Intl.DateTimeFormat("en-US", {
        timeZone: live.tz ?? "UTC",
        weekday: "short",
      }).format(now);
      return DAY_SHORT.indexOf(wd);
    } catch {
      return -1;
    }
  })();

  return (
    <ul className="divide-y divide-border/60">
      {DAYS.map((day, i) => {
        const intervals = live.hours?.[i] ?? [];
        const isToday = i === today;
        return (
          <li
            key={day}
            className={cn(
              "flex items-baseline justify-between gap-4 py-1.5 text-[13px]",
              isToday && "font-medium text-foreground",
            )}
          >
            <span className={cn(isToday ? "text-foreground" : "text-muted-foreground")}>
              {day}
              {isToday ? (
                <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-primary">
                  today
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "text-num text-right",
                intervals.length ? "text-muted-foreground" : "text-unknown",
              )}
            >
              {intervals.length
                ? intervals.map(([o, c]) => `${minutesToClock(o)}–${minutesToClock(c)}`).join(", ")
                : "Closed"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Tailwind scans source text for class names, so `text-${tone}` only ever
 * resolved because all four literals happened to be written out elsewhere in
 * the repo. Deleting the last such line anywhere would have silently unstyled
 * this one. Name them here instead.
 */
const OPEN_TONE_CLASS: Record<"verified" | "watch" | "critical" | "unknown", string> = {
  verified: "text-verified",
  watch: "text-watch",
  critical: "text-critical",
  unknown: "text-unknown",
};

const AMENITY_LABELS: Record<string, string> = {
  reservable: "Takes reservations",
  outdoorSeating: "Outdoor seating",
  goodForGroups: "Works for groups",
  goodForChildren: "Welcomes children",
  menuForChildren: "Children's menu",
  servesVegetarianFood: "Vegetarian options",
  servesCocktails: "Cocktails",
  servesWine: "Wine",
  servesBeer: "Beer",
  servesBrunch: "Brunch service",
  servesLunch: "Lunch service",
  servesDinner: "Dinner service",
  servesDessert: "Dessert",
  liveMusic: "Live music",
  takeout: "Takeout",
  dineIn: "Dine-in",
  restroom: "Restroom",
};

export function TableIntelligence({
  record,
  live,
  partySize,
  now = new Date(),
}: {
  record: RestaurantRecord;
  live: LiveRow | undefined;
  partySize: number | null;
  now?: Date;
}) {
  const spend = spendLine(live);
  const total = partyTotal(live, partySize);
  const dishes = live?.dishes ?? [];
  const rep = live?.rep;
  const open = openStateAt(live, now);
  const openState = openLabel(open);

  const amenities = live?.am
    ? Object.entries(live.am)
        .filter(([k, v]) => v === true && AMENITY_LABELS[k])
        .map(([k]) => AMENITY_LABELS[k]!)
    : [];
  const absent = live?.am
    ? Object.entries(live.am)
        .filter(
          ([k, v]) =>
            v === false &&
            ["outdoorSeating", "reservable", "goodForChildren", "servesBrunch"].includes(k),
        )
        .map(([k]) => AMENITY_LABELS[k]!)
    : [];

  const a11y = live?.a11y;
  const parkingFacts = live?.parking
    ? Object.entries(live.parking)
        .filter(([, v]) => v === true)
        .map(([k]) =>
          k
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (m) => m.toUpperCase())
            .trim(),
        )
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── What to order ─────────────────────────────────────── */}
      <Panel
        title="What to order"
        source={
          dishes.length
            ? dishes.every((d) => d.source === "first-party")
              ? "The restaurant"
              : "Restaurant + recurring in reviews"
            : undefined
        }
      >
        {dishes.length ? (
          <ul className="flex flex-wrap gap-2">
            {dishes.map((d) => (
              <li
                key={d.name}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]",
                  d.source === "first-party"
                    ? "border-verified/40 bg-verified/10 text-foreground"
                    : "border-border bg-surface-raised/50 text-muted-foreground",
                )}
                title={
                  d.source === "first-party"
                    ? "Named by the restaurant"
                    : "Recurs across recent reviews"
                }
              >
                {d.name}
                <span className="text-[9px] uppercase tracking-[0.1em] text-subtle">
                  {d.source === "first-party" ? "house" : "reviews"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-unknown">
            No dish is named on the restaurant&rsquo;s own pages, and nothing repeats often enough
            across reviews to record. Ask what the kitchen is known for when you call — this is a
            gap in the file, not a verdict on the food.
          </p>
        )}
        {stated(record.menuSummary) ? (
          <p className="mt-3 border-t border-border/60 pt-3 text-[13px] leading-relaxed text-muted-foreground">
            <span className="text-eyebrow mr-2">Menu format</span>
            {record.menuSummary}
          </p>
        ) : null}
      </Panel>

      {/* ── What it costs ─────────────────────────────────────── */}
      <Panel title="What it costs" source={spend?.source}>
        {spend ? (
          <>
            <p className="font-display text-2xl leading-none tracking-tight text-foreground">
              {spend.text.replace(/^About /, "")}
            </p>
            {total ? (
              <p className="mt-1.5 text-[13px] text-muted-foreground">{total}, before drinks</p>
            ) : null}
            {live?.band ? (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="text-num rounded border border-border px-2 py-0.5 text-foreground">
                  {live.band}
                </span>
                <span className="text-subtle">
                  {live.bandSource === "directory" ? "directory band" : "planning band"}
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-unknown">
            No per-guest figure is published. Ask for a current total including service before you
            commit a capped budget.
          </p>
        )}
        {bookingRiskLine(live) ? (
          <p className="mt-3 rounded-lg border border-watch/40 bg-watch/10 px-3 py-2 text-[13px] leading-relaxed text-foreground">
            <span className="text-eyebrow mr-2 text-watch">If you cancel</span>
            {bookingRiskLine(live)}
            <span className="mt-1 block text-[11px] text-subtle">
              Money you can lose without eating — separate from the price of the meal.
            </span>
          </p>
        ) : null}
        {stated(record.priceDetails) ? (
          <p className="mt-3 border-t border-border/60 pt-3 text-[13px] leading-relaxed text-muted-foreground">
            {record.priceDetails}
          </p>
        ) : null}
      </Panel>

      {/* ── When you can go ───────────────────────────────────── */}
      <Panel title="When you can go" source={hoursProvenance(live) ?? undefined}>
        {live?.hours ? (
          <>
            <p className={cn("mb-3 text-[13px] font-medium", OPEN_TONE_CLASS[openState.tone])}>
              {openState.text}
            </p>
            <HoursGrid live={live} now={now} />
            <p className="mt-3 text-[11px] leading-relaxed text-subtle">
              Local time at the restaurant. Holidays, private buyouts and last-seating rules are not
              in the published schedule.
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {stated(record.hoursSummary) ?? "Hours were not published on the reviewed pages."}
            <span className="mt-2 block text-unknown">
              No machine-readable schedule is held, so the instrument cannot tell you whether this
              room is serving right now.
            </span>
          </p>
        )}
      </Panel>

      {/* ── The tradeoff ──────────────────────────────────────── */}
      <Panel
        title="The tradeoff"
        source={
          rep
            ? `${rep.sample ? `${rep.sample.toLocaleString()} reviews · ` : ""}${rep.recency ?? ""}`.trim() ||
              "Recurring review patterns"
            : undefined
        }
      >
        {rep ? (
          <div className="space-y-3">
            {rep.praise.length ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-verified">
                  What people repeat
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {rep.praise.map((x) => (
                    <li key={x} className="text-[13px] leading-relaxed text-muted-foreground">
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {rep.complaints.length ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-watch">
                  What people complain about
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {rep.complaints.map((x) => (
                    <li key={x} className="text-[13px] leading-relaxed text-muted-foreground">
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {rep.consistency ? (
              <p className="border-t border-border/60 pt-3 text-[13px] leading-relaxed text-foreground">
                <span className="text-eyebrow mr-2">Consensus</span>
                {rep.consistency}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-unknown">
            No review-pattern research has been done on this room yet, so the instrument cannot tell
            you what people consistently praise or complain about. Absence of a pattern is not a
            good sign or a bad one.
          </p>
        )}
      </Panel>

      {/* ── Getting there ─────────────────────────────────────── */}
      <Panel
        title="Getting there"
        source={live?.llSource === "exact" ? "Directory listing" : undefined}
      >
        <dl className="space-y-2 text-[13px]">
          {live?.hood ? (
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-subtle">Neighbourhood</dt>
              <dd className="text-foreground">{live.hood}</dd>
            </div>
          ) : null}
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-subtle">Address</dt>
            <dd className={record.address ? "text-muted-foreground" : "text-unknown"}>
              {record.address || "No street address is on file."}
            </dd>
          </div>
          {/*
           * Provenance for the point, said in the same breath as the address.
           * Only 111 rooms in the corpus carry their own coordinate; the rest
           * sit on their city's centroid, and any distance drawn against that
           * is a distance to the middle of town.
           */}
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-subtle">Coordinate</dt>
            <dd className={live?.llSource === "exact" ? "text-muted-foreground" : "text-unknown"}>
              {live?.llSource === "exact"
                ? "This room's own point, from its directory listing."
                : live?.ll
                  ? `City centroid for ${record.city || "this city"}. Every room here shares it, so any distance shown is to the middle of town.`
                  : "No coordinate is held. Deep Dish cannot state a distance to this room."}
            </dd>
          </div>
          {parkingFacts.length ? (
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-subtle">Parking</dt>
              <dd className="text-muted-foreground">{parkingFacts.join(" · ")}</dd>
            </div>
          ) : null}
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-subtle">Step-free</dt>
            <dd className={a11y ? "text-muted-foreground" : "text-unknown"}>
              {a11y ? (
                <>
                  {[
                    a11y.entrance && "entrance",
                    a11y.restroom && "restroom",
                    a11y.seating && "seating",
                    a11y.parking && "parking",
                  ]
                    .filter(Boolean)
                    .join(", ") || "Reported, details unclear"}
                  <span className="ml-1.5 text-subtle">— reported, confirm on the day</span>
                </>
              ) : (
                (stated(record.accessibilityState) ?? "Not stated on any source held.")
              )}
            </dd>
          </div>
        </dl>
        {live?.mapUri ? (
          <a
            href={live.mapUri}
            target="_blank"
            rel="noopener noreferrer"
            className="tap mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            Directions
            <span aria-hidden>↗</span>
          </a>
        ) : null}
      </Panel>

      {/* ── The room ──────────────────────────────────────────── */}
      <Panel title="The room" source={amenities.length ? "Directory listing" : undefined}>
        {stated(record.atmosphereSummary) ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {record.atmosphereSummary}
          </p>
        ) : null}
        {amenities.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <li
                key={a}
                className="rounded-full border border-border bg-surface-raised/50 px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {a}
              </li>
            ))}
          </ul>
        ) : null}
        {absent.length ? (
          <p className="mt-2.5 text-[11px] text-subtle">Reported absent: {absent.join(" · ")}</p>
        ) : null}
        {stated(record.dressCode) ? (
          <p className="mt-3 border-t border-border/60 pt-3 text-[13px] leading-relaxed text-muted-foreground">
            <span className="text-eyebrow mr-2">Dress</span>
            {record.dressCode}
          </p>
        ) : null}
        {!stated(record.atmosphereSummary) && !amenities.length && !stated(record.dressCode) ? (
          <p className="text-[13px] text-unknown">Nothing describing the room is on file.</p>
        ) : null}
      </Panel>
    </div>
  );
}

export function TableIntelligenceHeading() {
  return (
    <div>
      <Eyebrow>Table intelligence</Eyebrow>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        What the room is like, what to order, what it costs and what people consistently say — with
        each claim attributed to the restaurant, a directory listing, or recurring reviews.
      </p>
    </div>
  );
}
