import { useEffect, useState } from "react";
import type { RestaurantRecord } from "@/lib/dataset";
import { loadLiveGroup, type LiveRow } from "@/lib/live";

/**
 * Live rows for an arbitrary set of records.
 *
 * The home route loads one region group at a time, but a night plan can hold
 * rooms from several — a visitor comparing two cities, or a trip. This loads
 * every group the set touches and merges them, so distance, hours and spend
 * are available wherever the rooms came from.
 */
export function useLiveRows(records: RestaurantRecord[]): {
  rows: Record<string, LiveRow>;
  loading: boolean;
} {
  const [rows, setRows] = useState<Record<string, LiveRow>>({});
  const [loading, setLoading] = useState(false);

  // A stable key so the effect does not re-run on every render of the same set.
  const groupKey = [...new Set(records.map((r) => r.regionGroup || r.region))].sort().join("|");

  useEffect(() => {
    const groups = groupKey ? groupKey.split("|").filter(Boolean) : [];
    if (!groups.length) {
      setRows({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(groups.map(loadLiveGroup)).then((sets) => {
      if (cancelled) return;
      setRows(Object.assign({}, ...sets));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groupKey]);

  return { rows, loading };
}

/** A clock that ticks each minute, so "open now" stays true while the page is open. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
