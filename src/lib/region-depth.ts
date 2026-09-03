/**
 * How deep the corpus actually is where the reader is standing.
 *
 * 47 of the 167 regions hold fewer than five files and 31 hold exactly one.
 * The ranked list loads a whole state and then filters to the chosen city, so
 * a reader in Bend can watch a full-looking page resolve to a single room with
 * nothing said about why. That reads as breakage. It is not: it is the shape of
 * a corpus built by reading restaurants' own pages one at a time.
 *
 * Counted from corpusMeta.slugIndex — the slim index home already imports — so
 * this costs nothing and cannot disagree with what the ranking will find.
 */
import { corpusMeta } from "@/lib/corpus-meta";

export type DepthBand = "single" | "shallow" | "partial" | "deep";

export type RegionDepthRead = {
  /** The place this is a count of. */
  label: string;
  /** Whether the count is for one city or a whole state. */
  scope: "region" | "group";
  count: number;
  band: DepthBand;
  /** How many cities the surrounding state holds, when a city was chosen. */
  groupLabel: string | null;
  groupCount: number;
};

const byRegion = new Map<string, number>();
const byGroup = new Map<string, number>();
for (const entry of corpusMeta.slugIndex) {
  if (entry.region) byRegion.set(entry.region, (byRegion.get(entry.region) ?? 0) + 1);
  if (entry.regionGroup) byGroup.set(entry.regionGroup, (byGroup.get(entry.regionGroup) ?? 0) + 1);
}

export function bandFor(count: number): DepthBand {
  if (count <= 1) return "single";
  if (count < 5) return "shallow";
  if (count < 15) return "partial";
  return "deep";
}

export function countForRegion(region: string): number {
  return byRegion.get(region) ?? 0;
}

export function countForGroup(group: string): number {
  return byGroup.get(group) ?? 0;
}

/** Regions holding fewer than `n` files, and how many hold exactly one. */
export const REGION_SHAPE = {
  regions: byRegion.size,
  underFive: [...byRegion.values()].filter((n) => n < 5).length,
  single: [...byRegion.values()].filter((n) => n === 1).length,
};

export function readRegionDepth(
  region: string | null | undefined,
  group: string | null | undefined,
): RegionDepthRead | null {
  const groupLabel = String(group ?? "").trim() || null;
  const groupCount = groupLabel ? countForGroup(groupLabel) : 0;
  const regionLabel = String(region ?? "").trim();
  if (regionLabel) {
    const count = countForRegion(regionLabel);
    return {
      label: regionLabel,
      scope: "region",
      count,
      band: bandFor(count),
      groupLabel,
      groupCount,
    };
  }
  if (!groupLabel) return null;
  return {
    label: groupLabel,
    scope: "group",
    count: groupCount,
    band: bandFor(groupCount),
    groupLabel,
    groupCount,
  };
}

/**
 * The depth, said before the reader spends a search on it.
 *
 * Each band gets its own sentence rather than one sentence with a number
 * swapped in, because "1 file" and "40 files" are not the same news and should
 * not sound like it.
 */
export function depthSentence(read: RegionDepthRead): string {
  const place = read.label;
  const files = `${read.count} ${read.count === 1 ? "file" : "files"}`;
  switch (read.band) {
    case "single":
      return read.count === 0
        ? `Deep Dish holds nothing in ${place}. Not a thin shelf, an empty one.`
        : `One room in ${place} has been read end to end. That is the whole shelf, not the first page of it.`;
    case "shallow":
      return `${files} in ${place}. A room enters this corpus when its own pages say enough to enter, not to fill a map.`;
    case "partial":
      return `${files} in ${place}, each read from the restaurant's own pages. Enough to choose between, not enough to call the city covered.`;
    case "deep":
      return `${files} in ${place}. Deep enough that the ranking is doing real work rather than listing what exists.`;
  }
}

/** What a reader can do about a shelf that is too short for the night. */
export function depthNextStep(read: RegionDepthRead): string | null {
  if (read.band === "deep" || read.band === "partial") return null;
  if (read.scope === "region" && read.groupLabel && read.groupCount > read.count) {
    return `Widen to all of ${read.groupLabel} for ${read.groupCount}.`;
  }
  return null;
}
