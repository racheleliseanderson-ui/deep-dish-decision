/**
 * Region-first record loader.
 * Home ranks only after a region group is chosen; Atlas still holds the full corpus.
 */
import type { RestaurantRecord } from "@/lib/dataset";
import { regionGroupFileName } from "@/lib/corpus-meta";
import slugIndex from "@/data/slug-index.json";

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

/**
 * Find one record by slug without loading the corpus.
 *
 * The obvious way to do this is `bySlug` from @/lib/dataset, and three route
 * loaders did exactly that — pulling a 5.4 MB chunk to read one entry. During
 * SSR that costs the browser nothing, but on client-side navigation (browse
 * the list, tap a restaurant — the normal path) the loader runs in the browser
 * and fetches all of it.
 *
 * The slug index is 30 KB and says which region file to open; the region file
 * is ~130 KB. Two small fetches instead of the whole corpus, and the region is
 * usually already cached because the list that was just browsed loaded it.
 */
export async function loadRecordBySlug(slug: string): Promise<RestaurantRecord | null> {
  const idx = slugIndex as { groups: string[]; slugs: Record<string, number> };
  const groupIdx = idx.slugs[slug];
  if (groupIdx === undefined) return null;
  const file = idx.groups[groupIdx];
  if (!file) return null;
  const loader = loaders[`../data/by-region/${file}.json`];
  if (!loader) return null;
  const records = unpack(await loader());
  cache.set(file, records);
  return records.find((r) => r.slug === slug) ?? null;
}

export function loadedRegionCount(): number {
  let n = 0;
  for (const rows of cache.values()) n += rows.length;
  return n;
}
