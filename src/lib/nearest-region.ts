import { corpusMeta, regionGroupFileName } from "@/lib/corpus-meta";
import { haversineMi, type LatLng, type LiveRow } from "@/lib/live";

type LiveFile = {
  regionGroup: string;
  generatedAt: string;
  records: Record<string, LiveRow>;
};

const loaders = import.meta.glob<LiveFile | { default: LiveFile }>("../data/live/*.json");

function unpack(mod: LiveFile | { default: LiveFile }): Record<string, LiveRow> {
  const file = "records" in mod ? mod : mod.default;
  return file?.records ?? {};
}

/**
 * Resolve browser geolocation to the closest corpus region group.
 *
 * This intentionally runs only after the user taps "Near me". The home route
 * stays split by region; the one-time lookup loads the small live coordinate
 * files, finds the closest known restaurant point, then the normal one-region
 * loader takes over.
 */
export async function findNearestRegionGroup(
  origin: LatLng,
): Promise<{ group: string; distanceMi: number } | null> {
  let best: { group: string; distanceMi: number } | null = null;

  await Promise.all(
    corpusMeta.regionGroups.map(async (group) => {
      const key = `../data/live/${regionGroupFileName(group)}.json`;
      const loader = loaders[key];
      if (!loader) return;
      const rows = unpack(await loader());
      for (const row of Object.values(rows)) {
        if (!row.ll) continue;
        const distanceMi = haversineMi(origin, row.ll);
        if (!Number.isFinite(distanceMi)) continue;
        if (!best || distanceMi < best.distanceMi) best = { group, distanceMi };
      }
    }),
  );

  return best;
}
