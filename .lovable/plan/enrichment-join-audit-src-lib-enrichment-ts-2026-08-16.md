# Enrichment join audit — `src/lib/enrichment.ts`

The reported "thin check" defect is already gone: the checks read only real record fields (`accessibilityState`, `parkingTransit`, `priceDetails`, `groupDetails`, `hoursSummary`, `dressCode`, `dietaryTags`/`dietaryDetails`), and `r.signals.wine` is a real field on `Signals`. Typecheck is clean. This plan covers the remaining weaknesses found while auditing the rest of the module.

Scope is logic only. No visual, copy, token, layout, or component change.

## What the audit found

1. **Provenance is inferred from the finding's id string.** `push()` guesses `site-scrape` vs `google-places` by substring-matching the id. It happens to be right today, but any new id (for example a site-derived finding without "site" in the id) would be labelled as a Google signal in the UI badge. The `"enrichment"` fallback is unreachable dead code.
2. **The volume cap can drop the most important findings.** `return f.slice(0, 8)` keeps the first eight in construction order, so a low-impact outdoor-seating note can survive while a high-impact situational group-policy or access finding is cut. The caller sorts afterwards, which is too late.
3. **A redundant condition.** The vegetarian branch guards on `(c("Severe allergy / celiac") || dietThin) && dietThin`, which reduces to `dietThin`.
4. **A redundant check.** `hoursThin` computes `isThin(r.hoursSummary) || !r.hoursSummary`; `isThin` already returns true for empty values.
5. **`isThin` misses common silent-value spellings.** It recognises "Not stated"/"Unstated"/dashes, but not "Unknown", "N/A", "None", "TBD", or "Not provided". Records using those read as informative first-party evidence, so a genuinely useful third-party signal stays hidden.

## Changes

- Give every finding an explicit `provenance` value at its construction site (`google-places` for Google-listing branches, `site-scrape` for venue-website branches) and drop the id-substring inference from `push()`.
- Before capping, sort candidates so situational findings and higher `impact` win, then take the top 8. Same cap, honest selection.
- Simplify the vegetarian and hours conditions to what they actually mean, with no behaviour change beyond removing the dead terms.
- Extend the silent-value list used by `isThin` to cover "Unknown", "N/A", "None", "TBD", "Not provided", matched case-insensitively.

## Guardrails preserved

- Enrichment stays labelled, never overwrites first-party values, never emits a `critical` layer, and never enters a fail-closed path — the caller in `src/lib/intelligence.ts` continues to force every enrichment finding to `watch`/`unknown`.
- Findings still appear only where first-party evidence is silent, and only when the enrichment toggle is on.

## Technical notes

- Files touched: `src/lib/enrichment.ts` only.
- `buildEnrichmentFindings(r, s, c)` keeps its signature; `enrichmentAudit()` is unchanged.
- Verification: typecheck, then load a record dossier and a decision packet for a slug with both Google and venue-website enrichment (111 of 225 enrichment records carry Google data, 207 carry site data) and confirm the source badges read correctly and findings render.
