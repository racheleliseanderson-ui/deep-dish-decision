import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Scored } from "@/lib/intelligence";
import { formatDistance } from "@/lib/live";
import { cn } from "@/lib/utils";

/**
 * Where the shortlist actually sits.
 *
 * A projected plot rather than a tile map: no API key, no third-party request,
 * no cookie, and it renders identically in print and in every contrast mode.
 * It answers the question a tile map is usually asked for — are these rooms
 * clustered in one neighbourhood or scattered across the metro, and which of
 * them is near me — without pretending to be a street atlas.
 */

type Pt = {
  sc: Scored;
  x: number;
  y: number;
  exact: boolean;
  label?: { text: string; dx: number; dy: number } | undefined;
  anchor?: "start" | "middle" | "end" | undefined;
};

const PAD = 26;
const W = 720;
const H = 400;

export function ResultsMap({
  scored,
  origin,
  originLabel,
  radiusMi,
  activeSlug,
  onHover,
  numberLabel = "Top three",
}: {
  scored: Scored[];
  origin: [number, number] | null;
  originLabel: string | null;
  radiusMi: number | null;
  activeSlug?: string | null;
  onHover?: (slug: string | null) => void;
  /** What the numbered pins mean here — ranking on the home list, order on a plan. */
  numberLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo(() => {
    const rows = scored.filter((s) => s.live?.ll);
    if (rows.length < 2) return null;

    const lats = rows.map((s) => s.live!.ll![0]);
    const lngs = rows.map((s) => s.live!.ll![1]);
    if (origin) {
      lats.push(origin[0]);
      lngs.push(origin[1]);
    }

    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    // Equirectangular with a cosine correction: accurate enough at metro scale.
    const kx = Math.cos((midLat * Math.PI) / 180);
    const px = (lng: number) => lng * kx;

    let minX = Math.min(...lngs.map(px));
    let maxX = Math.max(...lngs.map(px));
    let minY = -Math.max(...lats);
    let maxY = -Math.min(...lats);

    // A radius you set should be visible — but a 25-mile ring around three
    // rooms in one neighbourhood would shrink them to dust, so only widen the
    // frame up to twice the spread of the rooms themselves. Beyond that the
    // ring simply runs off the edge, which reads correctly as "all of these
    // are well inside it".
    if (origin && radiusMi) {
      const degLat = radiusMi / 69;
      const cap = Math.max((maxY - minY) * 2, 0.01);
      const grow = Math.min(degLat, cap);
      minX = Math.min(minX, px(origin[1] - grow / kx));
      maxX = Math.max(maxX, px(origin[1] + grow / kx));
      minY = Math.min(minY, -origin[0] - grow);
      maxY = Math.max(maxY, -origin[0] + grow);
    }

    // Never let a tight cluster blow up to absurd zoom.
    const spanX = Math.max((maxX - minX) * 1.18, 0.004);
    const spanY = Math.max((maxY - minY) * 1.18, 0.004);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Match the aspect of the viewport so circles stay circles.
    const aspect = (W - PAD * 2) / (H - PAD * 2);
    let sx = spanX;
    let sy = spanY;
    if (sx / sy > aspect) sy = sx / aspect;
    else sx = sy * aspect;
    minX = cx - sx / 2;
    maxX = cx + sx / 2;
    minY = cy - sy / 2;
    maxY = cy + sy / 2;

    const toX = (lng: number) => PAD + ((px(lng) - minX) / (maxX - minX)) * (W - PAD * 2);
    const toY = (lat: number) => PAD + ((-lat - minY) / (maxY - minY)) * (H - PAD * 2);

    const pts: Pt[] = rows.map((sc) => ({
      sc,
      x: toX(sc.live!.ll![1]),
      y: toY(sc.live!.ll![0]),
      exact: sc.live!.llSource === "exact",
    }));

    /* Label placement: try four positions around each point and take the
       first that lands on neither another point nor an already-placed label.
       With a dozen labels a greedy pass is exact enough and stays stable. */
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const CH = 6.1; // approximate character advance at 11px
    for (const p of pts.filter((q) => q.sc.rank <= 3)) {
      const text =
        p.sc.record.title.length > 22 ? `${p.sc.record.title.slice(0, 21)}…` : p.sc.record.title;
      const w = text.length * CH;
      const candidates: { dx: number; dy: number; anchor: Pt["anchor"] }[] = [
        { dx: 0, dy: -14, anchor: "middle" },
        { dx: 0, dy: 20, anchor: "middle" },
        { dx: 12, dy: 4, anchor: "start" },
        { dx: -12, dy: 4, anchor: "end" },
        { dx: 0, dy: -26, anchor: "middle" },
      ];
      let chosen = candidates[0]!;
      for (const cand of candidates) {
        const lx =
          cand.anchor === "middle"
            ? p.x - w / 2
            : cand.anchor === "start"
              ? p.x + cand.dx
              : p.x + cand.dx - w;
        const box = { x: lx, y: p.y + cand.dy - 9, w, h: 12 };
        const hitsPoint = pts.some(
          (q) =>
            q.x > box.x - 8 &&
            q.x < box.x + box.w + 8 &&
            q.y > box.y - 6 &&
            q.y < box.y + box.h + 6,
        );
        const hitsLabel = placed.some(
          (b) =>
            box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y,
        );
        const inFrame = box.x > 2 && box.x + box.w < W - 2 && box.y > 2 && box.y + box.h < H - 20;
        if (!hitsPoint && !hitsLabel && inFrame) {
          chosen = cand;
          placed.push(box);
          break;
        }
      }
      p.label = { text, dx: chosen.dx, dy: chosen.dy };
      p.anchor = chosen.anchor;
    }

    const originPt = origin ? { x: toX(origin[1]), y: toY(origin[0]) } : null;

    // Radius ring, in projected units.
    let ringR: number | null = null;
    if (origin && radiusMi) {
      const degLat = radiusMi / 69;
      ringR = Math.abs(toY(origin[0] - degLat) - toY(origin[0]));
    }

    // Scale bar: pick a round mile figure that fits comfortably.
    const milesAcross = (maxY - minY) * 69;
    const nice = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100].find((n) => n > milesAcross / 5) ?? 100;
    const barPx = (nice / 69 / (maxY - minY)) * (H - PAD * 2);

    return { pts, originPt, ringR, scale: { miles: nice, px: barPx } };
  }, [scored, origin, radiusMi]);

  if (!model) return null;

  const active = hover ?? activeSlug ?? null;
  const activePt = model.pts.find((p) => p.sc.record.slug === active);
  const anyEstimated = model.pts.some((p) => !p.exact);

  return (
    <figure className="mt-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-sunken">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Plot of ${model.pts.length} ranked rooms${originLabel ? ` relative to ${originLabel}` : ""}.`}
        >
          <defs>
            <pattern id="rm-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path
                d="M48 0 L0 0 0 48"
                fill="none"
                stroke="var(--border)"
                strokeWidth="0.5"
                opacity="0.5"
              />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#rm-grid)" />

          {/* radius ring */}
          {model.originPt && model.ringR ? (
            <>
              <circle
                cx={model.originPt.x}
                cy={model.originPt.y}
                r={model.ringR}
                fill="var(--primary)"
                opacity="0.06"
              />
              <circle
                cx={model.originPt.x}
                cy={model.originPt.y}
                r={model.ringR}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.55"
              />
            </>
          ) : null}

          {/* line from origin to the active room */}
          {model.originPt && activePt ? (
            <line
              x1={model.originPt.x}
              y1={model.originPt.y}
              x2={activePt.x}
              y2={activePt.y}
              stroke="var(--primary)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          ) : null}

          {/* rooms — rank 1-3 read as the leaders */}
          {model.pts.map((p) => {
            const isActive = p.sc.record.slug === active;
            const lead = p.sc.rank <= 3;
            const blocked = p.sc.blocked;
            return (
              <g
                key={p.sc.record.slug}
                onPointerEnter={() => {
                  setHover(p.sc.record.slug);
                  onHover?.(p.sc.record.slug);
                }}
                onPointerLeave={() => {
                  setHover(null);
                  onHover?.(null);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 11 : lead ? 8 : 5.5}
                  fill={
                    blocked
                      ? "var(--surface-raised)"
                      : lead
                        ? "var(--primary)"
                        : "var(--surface-raised)"
                  }
                  stroke={blocked ? "var(--critical)" : "var(--primary)"}
                  strokeWidth={isActive ? 2 : 1.25}
                  strokeDasharray={p.exact ? undefined : "2 2"}
                  opacity={blocked ? 0.55 : 1}
                />
                {lead && !blocked ? (
                  <text
                    x={p.x}
                    y={p.y + 3.2}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="var(--primary-foreground)"
                    pointerEvents="none"
                  >
                    {p.sc.rank}
                  </text>
                ) : null}
                <title>
                  {p.sc.record.title}
                  {p.sc.distanceMi !== null ? ` — ${formatDistance(p.sc.distanceMi, p.exact)}` : ""}
                </title>
              </g>
            );
          })}

          {/* labels above the points, never underneath one */}
          <g pointerEvents="none">
            {model.pts.map((p) =>
              p.label && !p.sc.blocked ? (
                <text
                  key={`l-${p.sc.record.slug}`}
                  x={p.x + p.label.dx}
                  y={p.y + p.label.dy}
                  textAnchor={p.anchor ?? "middle"}
                  fontSize="11"
                  fill="var(--foreground)"
                  stroke="var(--background)"
                  strokeWidth="3.5"
                  paintOrder="stroke"
                >
                  {p.label.text}
                </text>
              ) : null,
            )}
          </g>

          {/* origin marker last so it sits on top */}
          {model.originPt ? (
            <g pointerEvents="none">
              <circle
                cx={model.originPt.x}
                cy={model.originPt.y}
                r="7"
                fill="var(--verified)"
                opacity="0.25"
              />
              <circle
                cx={model.originPt.x}
                cy={model.originPt.y}
                r="3.5"
                fill="var(--verified)"
                stroke="var(--background)"
                strokeWidth="1.5"
              />
            </g>
          ) : null}

          {/* scale bar */}
          <g transform={`translate(${PAD}, ${H - 14})`} pointerEvents="none">
            <line x1="0" y1="0" x2={model.scale.px} y2="0" stroke="var(--subtle)" strokeWidth="1" />
            <line x1="0" y1="-3" x2="0" y2="3" stroke="var(--subtle)" strokeWidth="1" />
            <line
              x1={model.scale.px}
              y1="-3"
              x2={model.scale.px}
              y2="3"
              stroke="var(--subtle)"
              strokeWidth="1"
            />
            <text x={model.scale.px + 6} y="3.5" fontSize="10" fill="var(--subtle)">
              {model.scale.miles < 1 ? `${model.scale.miles * 5280} ft` : `${model.scale.miles} mi`}
            </text>
          </g>
        </svg>
      </div>

      {/* the hovered room, named */}
      <div className="mt-2 flex min-h-9 flex-wrap items-center justify-between gap-3 text-[12px]">
        <div className="min-w-0">
          {activePt ? (
            <Link
              to="/record/$slug"
              params={{ slug: activePt.sc.record.slug }}
              className="truncate font-medium text-foreground hover:text-primary"
            >
              {activePt.sc.rank}. {activePt.sc.record.title}
              {activePt.sc.distanceMi !== null ? (
                <span className="ml-2 text-subtle">
                  {formatDistance(activePt.sc.distanceMi, activePt.exact)}
                </span>
              ) : null}
            </Link>
          ) : (
            <span className="text-subtle">Hover a point to name the room.</span>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-subtle">
          {origin ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-verified" />
              {originLabel ?? "You"}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            {numberLabel}
          </span>
          {anyEstimated ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn("size-2 rounded-full border border-dashed border-primary")}
              />
              City-level point
            </span>
          ) : null}
        </div>
      </div>

      <figcaption className="mt-1.5 text-[11px] leading-relaxed text-subtle">
        Equirectangular plot from recorded coordinates. Dashed points are city centroids, used
        where the room&rsquo;s own coordinate is not on file.
      </figcaption>
    </figure>
  );
}
