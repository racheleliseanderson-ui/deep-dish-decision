/**
 * How a night becomes a shortlist.
 *
 * The fail-closed rule is the least intuitive thing the instrument does, and
 * it was previously explained only in prose. This is the same rule as a
 * diagram: what filters, what only reorders, and the three distinct outcomes
 * a room can reach — recommended, recommended with a call to make, or held.
 *
 * Inline SVG so it inherits the theme tokens, prints, and needs no runtime.
 */

const W = 900;
const H = 470;

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  tone = "neutral",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  tone?: "neutral" | "gain" | "warn" | "stop" | "lead";
}) {
  const stroke =
    tone === "stop"
      ? "var(--critical)"
      : tone === "warn"
        ? "var(--watch)"
        : tone === "gain"
          ? "var(--verified)"
          : tone === "lead"
            ? "var(--primary)"
            : "var(--border-strong)";
  const fill = tone === "neutral" ? "var(--surface-raised)" : "var(--surface-sunken)";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="10"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.25"
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fontSize="13"
        fill="var(--foreground)"
      >
        {title}
      </text>
      {sub ? (
        <text
          x={x + w / 2}
          y={y + h / 2 + 14}
          textAnchor="middle"
          fontSize="11"
          fill="var(--subtle)"
        >
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function Arrow({
  d,
  label,
  labelX,
  labelY,
  tone = "neutral",
}: {
  d: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  tone?: "neutral" | "stop" | "warn";
}) {
  const stroke =
    tone === "stop" ? "var(--critical)" : tone === "warn" ? "var(--watch)" : "var(--border-strong)";
  return (
    <g>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.25" markerEnd="url(#df-arrow)" />
      {label && labelX != null && labelY != null ? (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--subtle)"
          stroke="var(--background)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function DecisionFlow() {
  return (
    <figure className="mt-6">
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface-sunken/45 p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[640px]"
          role="img"
          aria-labelledby="df-title df-desc"
        >
          <title id="df-title">How a night becomes a shortlist</title>
          <desc id="df-desc">
            Every record in the chosen region passes through three hard filters — region, radius and
            serving hours. Surviving rooms are scored on occasion fit, distance, timing, party,
            spend and booking path. Stated guest needs are then tested: a room that states it cannot
            meet a need is held and shown last with the reason; a room whose evidence is silent is
            recommended with the confirmation call named; a room with positive evidence is
            recommended outright.
          </desc>

          <defs>
            <marker
              id="df-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 z" fill="var(--border-strong)" />
            </marker>
          </defs>

          {/* Column 1 — the corpus */}
          <text x="20" y="26" fontSize="10.5" fill="var(--gilt)" letterSpacing="1.6">
            001 EVERY RECORD
          </text>
          <Box
            x={20}
            y={40}
            w={170}
            h={54}
            title="The region's records"
            sub="loaded one region at a time"
          />

          {/* Column 2 — hard filters */}
          <text x="240" y="26" fontSize="10.5" fill="var(--gilt)" letterSpacing="1.6">
            002 HARD FILTERS
          </text>
          <Box x={240} y={40} w={170} h={44} title="Inside your radius" tone="neutral" />
          <Box x={240} y={98} w={170} h={44} title="Serving at your time" tone="neutral" />
          <Box x={240} y={156} w={170} h={44} title="Cuisine / search match" tone="neutral" />
          <text x="325" y="222" textAnchor="middle" fontSize="10.5" fill="var(--subtle)">
            these remove rooms
          </text>

          <Arrow d="M190 67 L236 62" />
          <Arrow d="M190 67 L236 118" />
          <Arrow d="M190 67 L236 176" />

          {/* Column 3 — scoring */}
          <text x="460" y="26" fontSize="10.5" fill="var(--gilt)" letterSpacing="1.6">
            003 ORDERING
          </text>
          <rect
            x={460}
            y={40}
            width={180}
            height={160}
            rx="10"
            fill="var(--surface-sunken)"
            stroke="var(--primary)"
            strokeWidth="1.25"
          />
          <text x="550" y="76" textAnchor="middle" fontSize="13" fill="var(--foreground)">
            Fit score
          </text>
          {[
            "occasion",
            "distance",
            "serving hours",
            "party · spend",
            "booking path",
            "evidence depth",
          ].map((line, i) => (
            <text
              key={line}
              x="550"
              y={102 + i * 16}
              textAnchor="middle"
              fontSize="11"
              fill="var(--subtle)"
            >
              {line}
            </text>
          ))}
          <text x="550" y="222" textAnchor="middle" fontSize="10.5" fill="var(--subtle)">
            this only reorders
          </text>

          <Arrow d="M414 62 L456 100" />
          <Arrow d="M414 120 L456 120" />
          <Arrow d="M414 178 L456 140" />

          {/* Column 4 — the fail-closed test */}
          <text x="690" y="26" fontSize="10.5" fill="var(--gilt)" letterSpacing="1.6">
            004 STATED NEEDS
          </text>
          <Box
            x={690}
            y={40}
            w={190}
            h={54}
            title="Can the room meet it?"
            sub="allergy · access · private"
            tone="neutral"
          />
          <Arrow d="M644 100 L686 74" />

          {/* Three outcomes */}
          <Box
            x={700}
            y={148}
            w={186}
            h={54}
            title="Evidence says yes"
            sub="recommended"
            tone="gain"
          />
          <Box
            x={700}
            y={224}
            w={186}
            h={54}
            title="Evidence is silent"
            sub="recommended, call named"
            tone="warn"
          />
          <Box
            x={700}
            y={300}
            w={186}
            h={54}
            title="It states it cannot"
            sub="held, shown last, with why"
            tone="stop"
          />

          {/* A branch, not a chain: one spine, three alternatives. */}
          <path
            d="M785 94 L785 118 Q785 126 777 126 L668 126 Q660 126 660 134 L660 327"
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="1.25"
          />
          <Arrow d="M660 175 L696 175" />
          <Arrow d="M660 251 L696 251" tone="warn" />
          <Arrow d="M660 327 L696 327" tone="stop" />

          {/* The rule, spelled out */}
          <rect
            x={20}
            y={262}
            width={620}
            height={104}
            rx="10"
            fill="var(--surface-sunken)"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x="38" y="288" fontSize="10.5" fill="var(--gilt)" letterSpacing="1.6">
            THE RULE
          </text>
          <text x="38" y="312" fontSize="13" fill="var(--foreground)">
            Silence is not a yes, and it is not a no either.
          </text>
          <text x="38" y="333" fontSize="12" fill="var(--muted-foreground)">
            A room is only held when it states it cannot meet your need. Where the evidence
          </text>
          <text x="38" y="351" fontSize="12" fill="var(--muted-foreground)">
            is simply missing, you still get the recommendation — and the question to ask.
          </text>

          {/* Footnote line */}
          <text x="20" y="404" fontSize="11" fill="var(--subtle)">
            Not in this diagram, because they are not in the calculation: star ratings, review
            sentiment, sponsored placement, popularity.
          </text>
          <text x="20" y="424" fontSize="11" fill="var(--subtle)">
            Directory ratings and recurring review patterns are shown on a room&rsquo;s page as
            context. They never move its position.
          </text>
        </svg>
      </div>
      <figcaption className="mt-2 text-[11px] leading-relaxed text-subtle">
        The ordering rule as implemented — filters remove, scoring reorders, and a stated need can
        only hold a room when the room itself says it cannot meet it.
      </figcaption>
    </figure>
  );
}
