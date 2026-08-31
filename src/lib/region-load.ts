/**
 * Region-first record loader.
 * Home ranks only after a region group is chosen; Atlas still holds 836.
 */
import type { RestaurantRecord } from "@/lib/dataset";
import { regionGroupFileName } from "@/lib/corpus-meta";

const loaders = import.meta.glob<{
  regionGroup?: string;
  count?: number;
  records?: RestaurantRecord[];
  default?: { regionGroup?: string; count?: number; records?: RestaurantRecord[] };
}>("../data/by-region/*.json");

const cache = new Map<string, RestaurantRecord[]>();

function unpack(mod: {
  records?: RestaurantRecord[];
  default?: { records?: RestaurantRecord[] };
}): RestaurantRecord[] {
  return mod.records ?? mod.default?.records ?? [];
}

export async function loadRegionGroup(group: string): Promise<RestaurantRecord[]> {
  if (cache.has(group)) return cache.get(group)!;
  const file = regionGroupFileName(group);
  const key = `../data/by-region/${file}.json`;
  const loader = loaders[key];
  if (!loader) return [];
  const records = unpack(await loader());
  cache.set(group, records);
  return records;
}

export function peekRegionGroup(group: string): RestaurantRecord[] | null {
  return cache.get(group) ?? null;
}

export function loadedRegionCount(): number {
  let n = 0;
  for (const rows of cache.values()) n += rows.length;
  return n;
}
