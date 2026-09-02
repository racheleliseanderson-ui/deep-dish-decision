import { useEffect, useState } from "react";
import type { RestaurantRecord } from "@/lib/dataset";
import { loadRecordBySlug } from "@/lib/region-load";

/**
 * Resolve a handful of slugs to records without the corpus.
 *
 * A night plan holds at most twelve slugs, and they are known only on the
 * client (they live in the reader's own shortlist), so a route loader cannot
 * fetch them ahead of time. The old approach imported @/lib/dataset for its
 * bySlug map — 5.4 MB to look up as few as one record.
 *
 * loadRecordBySlug reads a 30 KB index and then only the regions involved,
 * which are cached, so a shortlist that is all one city costs one region file.
 * Order is preserved: a night plan is a sequence, not a set.
 */
export function useRecordsBySlug(slugs: string[]): {
  records: RestaurantRecord[];
  loading: boolean;
} {
  const key = slugs.join("|");
  const [state, setState] = useState<{ records: RestaurantRecord[]; loading: boolean }>({
    records: [],
    loading: slugs.length > 0,
  });

  useEffect(() => {
    const wanted = key ? key.split("|") : [];
    if (!wanted.length) {
      setState({ records: [], loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    void Promise.all(wanted.map(loadRecordBySlug))
      .then((found) => {
        if (!alive) return;
        // A slug with no record is dropped, not rendered as a hole — the same
        // thing the bySlug lookup did for a retired or misspelled slug.
        setState({
          records: found.filter((r): r is RestaurantRecord => Boolean(r)),
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        // Without this the hook stayed on `loading` forever and the shortlist
        // showed a spinner with no way out.
        console.error("Shortlist records failed to resolve", error);
        setState({ records: [], loading: false });
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return state;
}
