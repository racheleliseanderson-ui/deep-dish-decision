import { useEffect, useState } from "react";
import { enrichmentGroupReady, loadEnrichmentGroup } from "@/lib/enrichment";

/**
 * Load the enrichment file for one or more region groups.
 *
 * Returns a boolean that flips once the data is in the registry, so a component
 * can re-render with it. Callers must not read enrichment before it is true:
 * they will get null, which is indistinguishable from "never enriched".
 *
 * Already-loaded groups start ready, so a second visit to a region does not
 * flash empty.
 */
export function useEnrichmentGroups(groups: string[]): boolean {
  const key = Array.from(new Set(groups.filter(Boolean))).sort().join("|");
  const [ready, setReady] = useState(() => key.split("|").filter(Boolean).every(enrichmentGroupReady));

  useEffect(() => {
    const wanted = key.split("|").filter(Boolean);
    if (!wanted.length) {
      setReady(true);
      return;
    }
    if (wanted.every(enrichmentGroupReady)) {
      setReady(true);
      return;
    }
    let alive = true;
    setReady(false);
    void Promise.all(wanted.map(loadEnrichmentGroup))
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        // Ready means "asked and answered". A failed group answers with no
        // enrichment, which the audit already renders as "never enriched".
        console.error("Enrichment groups failed to load", error);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return ready;
}

/** The single-region case, which is most of them. */
export function useEnrichmentGroup(group: string | undefined): boolean {
  return useEnrichmentGroups(group ? [group] : []);
}
