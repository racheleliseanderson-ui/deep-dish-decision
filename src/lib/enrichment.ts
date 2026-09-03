/**
 * Labeled third-party enrichment join.
 *
 * enrichment.json is intentionally separate from first-party dataset fields.
 * Signals surface only as Watch/Unknown findings with explicit provenance —
 * never as facts, never into critical/fail-closed paths, never overwriting
 * first-party values.
 */
import type { Constraint, Finding, Situation } from "@/lib/intelligence";
import type { RestaurantRecord } from "@/lib/dataset";
import { regionGroupFileName } from "@/lib/corpus-meta";

export type GoogleAmenities = {
  outdoorSeating?: boolean;
  reservable?: boolean;
  delivery?: boolean;
  takeout?: boolean;
  dineIn?: boolean;
  curbsidePickup?: boolean;
  goodForGroups?: boolean;
  goodForChildren?: boolean;
  liveMusic?: boolean;
  restroom?: boolean;
  menuForChildren?: boolean;
  servesVegetarianFood?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesCocktails?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesDessert?: boolean;
};

export type GoogleAccessibility = {
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleParking?: boolean;
  wheelchairAccessibleRestroom?: boolean;
  wheelchairAccessibleSeating?: boolean;
};

export type GoogleParking = Record<string, boolean | undefined>;

export type EnrichmentGoogle = {
  placeId?: string;
  displayName?: string;
  formattedAddress?: string;
  phone?: string;
  website?: string;
  priceLevel?: string;
  priceBand?: string;
  rating?: number;
  reviewCount?: number;
  hours?: Array<{ day: string; intervals: Array<{ open: string; close: string }> }>;
  amenities?: GoogleAmenities;
  accessibility?: GoogleAccessibility;
  parking?: GoogleParking;
  editorialSummary?: string;
  retrievedAt?: string;
};

export type SiteQuote = {
  quote: string;
  sourceUrl?: string;
};

/** Older pipeline runs stored plain strings; newer runs store quote objects. */
export type SiteLanguage = string | SiteQuote;

export function quoteText(q: SiteLanguage): string {
  return typeof q === "string" ? q : q.quote;
}

export type EnrichmentSite = {
  menuUrl?: string;
  reservationUrl?: string;
  reservationPlatform?: string;
  telephoneLanguage?: SiteLanguage[];
  hoursLanguage?: SiteLanguage[];
  priceLanguage?: SiteLanguage[];
  cuisineLanguage?: SiteLanguage[];
  dietaryLanguage?: SiteLanguage[];
  accessibilityLanguage?: SiteLanguage[];
  groupPolicy?: string;
  groupPolicyLanguage?: SiteLanguage[];
  dressCode?: string;
  cancellationLanguage?: SiteLanguage[];
  /** JSON-LD / og / hydration / noscript quotes. Not a verified access route. */
  jsonLdLanguage?: SiteLanguage[];
  playwrightPages?: number;
  pagesRead?: number;
  sourceUrls?: string[];
  retrievedAt?: string;
};

export type EnrichmentSummary = {
  text?: string;
  model?: string;
  basedOnFields?: string[];
  generatedAt?: string;
};

export type EnrichmentMeta = {
  matchStatus?: string;
  confidence?: number | null;
  nameScore?: number | null;
  lastEnrichedAt?: string;
  completeness?: number;
};

export type EnrichmentRecord = {
  google?: EnrichmentGoogle;
  site?: EnrichmentSite;
  summary?: EnrichmentSummary;
  meta?: EnrichmentMeta;
};

type EnrichmentFile = {
  generatedAt?: string;
  records: Record<string, EnrichmentRecord>;
};

/* ── loading ───────────────────────────────────────────────────────────────
 * This used to be `import raw from "@/data/enrichment.json"` — a single static
 * import of the whole 2.9 MB file. Vite turned that into a 2.2 MB client chunk
 * that every /record/<slug> page downloaded: the enrichment for all 1,094
 * restaurants, in order to render the audit for one. Nothing threw, so it never
 * read as a bug. It just made the most-visited page in the product slow.
 *
 * The file is split per region group now (scripts/pipeline/split-enrichment.mjs)
 * and pulled in on demand, exactly as the live layer is. A page loads its own
 * region and nothing else.
 *
 * The lookups below stay synchronous, because every caller is a render path and
 * async rendering is a much larger change than this warrants. The contract is
 * therefore: await loadEnrichmentGroup(group) before reading. Until it resolves
 * a lookup returns null, which every caller already handles — it is the same
 * answer they get for a restaurant that was never enriched.
 */

const loaders = import.meta.glob<EnrichmentFile | { default: EnrichmentFile }>(
  "../data/enrichment/*.json",
);
const registry = new Map<string, EnrichmentRecord>();
const loaded = new Map<string, Promise<void>>();

function unpack(mod: EnrichmentFile | { default: EnrichmentFile }): EnrichmentFile["records"] {
  const file = "records" in mod ? mod : mod.default;
  return file?.records ?? {};
}

/**
 * Load one region group's enrichment into the registry.
 *
 * Idempotent and concurrency-safe: the in-flight promise is cached, so ten
 * components asking at once produce one fetch. A group with no file resolves
 * rather than rejecting — plenty of regions have no enrichment at all, and that
 * is not an error.
 */
export function loadEnrichmentGroup(group: string): Promise<void> {
  const key = regionGroupFileName(group);
  const existing = loaded.get(key);
  if (existing) return existing;

  const loader = loaders[`../data/enrichment/${key}.json`];
  const task = loader
    ? loader()
        .then((mod) => {
          for (const [slug, entry] of Object.entries(unpack(mod))) registry.set(slug, entry);
        })
        .catch((error: unknown) => {
          // The in-flight promise is cached, so a rejection here used to poison
          // this group for the life of the page: every later caller inherited
          // the same rejected promise and no retry was possible. Drop the entry
          // and resolve, so the next caller starts a fresh load.
          loaded.delete(key);
          console.error(`Enrichment group "${key}" failed to load`, error);
        })
    : Promise.resolve();

  loaded.set(key, task);
  return task;
}

/** Whether a group's file has finished loading. */
export function enrichmentGroupReady(group: string): boolean {
  return loaded.has(regionGroupFileName(group));
}

export function getEnrichment(slug: string): EnrichmentRecord | null {
  return registry.get(slug) ?? null;
}

/**
 * Load every group at once.
 *
 * For node scripts and tests, which have no region context and want the whole
 * corpus. Never call this from the browser — it is the 2.2 MB import this
 * change exists to remove.
 */
export async function loadAllEnrichment(): Promise<void> {
  await Promise.all(Object.keys(loaders).map((k) => loadEnrichmentGroup(k.replace(/^.*\/(.+)\.json$/, "$1"))));
}

const NOT_STATED = [
  "not stated",
  "unstated",
  "not provided",
  "unknown",
  "none",
  "n/a",
  "na",
  "tbd",
  "—",
  "–",
  "-",
  "",
];

function isThin(v: string | null | undefined): boolean {
  if (v == null) return true;
  const t = String(v).trim().toLowerCase();
  return !t || NOT_STATED.includes(t) || /^not stated/i.test(t);
}


function accessLabels(a: GoogleAccessibility): string[] {
  const out: string[] = [];
  if (a.wheelchairAccessibleEntrance) out.push("wheelchair entrance");
  if (a.wheelchairAccessibleParking) out.push("accessible parking");
  if (a.wheelchairAccessibleRestroom) out.push("accessible restroom");
  if (a.wheelchairAccessibleSeating) out.push("accessible seating");
  return out;
}

function parkingLabels(p: GoogleParking): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (v === true) out.push(k.replace(/([A-Z])/g, " $1").toLowerCase().trim());
  }
  return out;
}

function hoursLine(
  hours: Array<{ day: string; intervals: Array<{ open: string; close: string }> }>,
): string {
  const open = hours.filter((h) => h.intervals?.length);
  if (!open.length) return "Google listing hours list no open intervals (closed or unlisted).";
  const sample = open.slice(0, 3).map((h) => {
    const ints = h.intervals
      .map((i) => `${i.open}–${i.close}`)
      .join(", ");
    return `${h.day}: ${ints}`;
  });
  return sample.join(" · ") + (open.length > 3 ? ` (+${open.length - 3} more days)` : "");
}

// UNUSED as of 2026-09-02 — no callers. Kept on disk deliberately; the
// "All sources / First-party only" control that would have reached it was
// removed from display-controls.tsx because it changed nothing a reader saw.
/** Build labeled Watch/Unknown findings from enrichment when first-party is silent. */
export function buildEnrichmentFindings(
  r: RestaurantRecord,
  s: Situation,
  c: (constraint: Constraint) => boolean,
): Finding[] {
  const enr = getEnrichment(r.slug);
  if (!enr) return [];
  const f: Finding[] = [];
  const g = enr.google;
  const site = enr.site;

  /** Provenance is declared at each construction site, and is never inferred from the id. */
  const push = (x: Finding) => {
    f.push(x);
  };

  const accessThin = isThin(r.accessibilityState);
  const parkingThin = isThin(r.parkingTransit);
  const hoursThin = isThin(r.hoursSummary);
  const priceThin = isThin(r.priceDetails);
  const dressThin = isThin(r.dressCode);
  const groupThin = isThin(r.groupDetails);
  const dietThin =
    r.dietaryTags.some((t) => isThin(t)) || isThin(r.dietaryDetails);

  /* --- Google accessibility (only when first-party is silent) -------- */
  if (accessThin && g?.accessibility) {
    const labels = accessLabels(g.accessibility);
    if (labels.length) {
      const mobility = c("Mobility / step-free needs");
      push({
        id: "enr-access-google",
        layer: "watch",
        domain: "enrichment",
        provenance: "google-places",
        title: `Google listing reports ${labels[0]}${labels.length > 1 ? ` (+${labels.length - 1})` : ""}`,
        detail: `${labels.join(" · ")}. Retrieved ${g.retrievedAt ?? "unknown"} — third-party directory signal only; first-party route remains unstated.`,
        action: mobility
          ? "Still confirm first-party route, restroom, and table height live — do not book an access-sensitive guest against a directory listing."
          : "Hold as corroboration only. Confirm entrance and restroom on the restaurant's own pages or by phone if a guest needs access detail.",
        impact: mobility ? 48 : 28,
        confidence: "low",
        situational: mobility,
      });
    }
  }

  /* --- Venue website accessibility language -------------------------- */
  if (accessThin && site?.accessibilityLanguage?.length) {
    push({
      id: "enr-access-site",
      layer: "watch",
      domain: "enrichment",
      provenance: "site-scrape",
      title: "Accessibility wording from the venue's own website",
      detail: site.accessibilityLanguage.slice(0, 3).map(quoteText).join(" · "),
      action:
        "Read the official page, then confirm the live route — website wording is not a guarantee of step-free access.",
      impact: c("Mobility / step-free needs") ? 44 : 26,
      confidence: "low",
      situational: c("Mobility / step-free needs"),
    });
  }

  /* --- Parking ------------------------------------------------------- */
  if (parkingThin && g?.parking) {
    const labels = parkingLabels(g.parking);
    if (labels.length) {
      push({
        id: "enr-parking-google",
        layer: "unknown",
        domain: "enrichment",
        provenance: "google-places",
        title: `Google listing parking signals: ${labels.join(", ")}`,
        detail: `Directory parking flags only. First-party arrival guidance is still unstated. Retrieved ${g.retrievedAt ?? "unknown"}.`,
        action: c("Mobility / step-free needs")
          ? "Ask where a passenger can be dropped within a step-free distance of the entrance."
          : c("Hard end time (show, train, childcare)")
            ? "Confirm valet or nearest garage timing — arrival friction breaks a hard end time."
            : "Check a map before you leave; treat Google parking flags as a lead, not a fact.",
        impact: c("Mobility / step-free needs") ? 42 : c("Hard end time (show, train, childcare)") ? 36 : 16,
        confidence: "low",
        situational: s.constraints.length > 0,
      });
    }
  }

  /* --- Hours --------------------------------------------------------- */
  if (hoursThin && g?.hours?.length) {
    const line = hoursLine(g.hours);
    if (line) {
      push({
        id: "enr-hours-google",
        layer: "watch",
        domain: "enrichment",
        provenance: "google-places",
        title: "Google listing hours available — the restaurant's own record doesn't state this",
        detail: line,
        action:
          "Confirm hours on the restaurant's own page or reservation system for your date — directory hours lag renovations and holidays.",
        impact: s.leadDays !== null && s.leadDays <= 2 ? 40 : 24,
        confidence: "low",
        situational: s.leadDays !== null && s.leadDays <= 2,
      });
    }
  }

  /* --- Price band ---------------------------------------------------- */
  if (priceThin && (g?.priceBand || g?.priceLevel)) {
    push({
      id: "enr-price-google",
      layer: "unknown",
      domain: "enrichment",
      provenance: "google-places",
      title: `Google listing price band ${g.priceBand ?? g.priceLevel} — the restaurant's own record doesn't state this`,
      detail: `Directory price level only. Does not include service charge, supplements, or beverage. Retrieved ${g.retrievedAt ?? "unknown"}.`,
      action: c("Hard budget cap") || s.spendBand
        ? "Get the current per-guest total in writing before treating this as inside a hard cap."
        : "Use only as a coarse band; price the full evening from the official menu.",
      impact: c("Hard budget cap") || s.spendBand ? 38 : 18,
      confidence: "low",
      situational: Boolean(c("Hard budget cap") || s.spendBand),
    });
  }

  /* --- Amenities when first-party is silent -------------------------- */
  if (g?.amenities) {
    const a = g.amenities;
    if (a.outdoorSeating === true && !/outdoor|patio|terrace/i.test(r.serviceSummary + r.atmosphereSummary)) {
      push({
        id: "enr-outdoor",
        layer: "unknown",
        domain: "enrichment",
        provenance: "google-places",
        title: "Google listing reports outdoor seating; the restaurant's own record is silent",
        detail: "Directory amenity flag only — season, weather policy, and reservation path unstated first-party.",
        action: "Ask whether patio seating is open on your date and whether it can be requested.",
        impact: 18,
        confidence: "low",
        situational: false,
      });
    }
    if (a.goodForGroups === true && (c("Large party (6+)") || (s.partySize ?? 0) >= 6) && groupThin) {
      push({
        id: "enr-groups",
        layer: "watch",
        domain: "enrichment",
        provenance: "google-places",
        title: "Google listing flags goodForGroups — the restaurant's own record doesn't state a group path",
        detail: "Directory amenity only. Deposits, set menus, and max table size still need first-party confirmation.",
        action: "Call for the large-party path before proposing this record to the group.",
        impact: 40,
        confidence: "low",
        situational: true,
      });
    }
    if (a.servesVegetarianFood === true && dietThin) {
      push({
        id: "enr-veg",
        layer: "unknown",
        domain: "enrichment",
        provenance: "google-places",
        title: "Google listing reports vegetarian options; the restaurant's own record doesn't state allergy or dietary policy",
        detail: "Vegetarian amenity is not an allergy guarantee. Cross-contact practice remains first-party only.",
        action: c("Severe allergy / celiac")
          ? "Ignore this flag for severe allergy — name the allergen and get kitchen confirmation."
          : "Confirm dietary handling on the official menu or by phone.",
        impact: c("Severe allergy / celiac") ? 22 : 16,
        confidence: "low",
        situational: c("Severe allergy / celiac"),
      });
    }
    if (
      (a.servesWine === true || a.servesCocktails === true) &&
      s.wineForward &&
      !["Cellar / pairing", "Deep program", "Solid list"].includes(r.signals.wine ?? "")
    ) {
      push({
        id: "enr-wine",
        layer: "unknown",
        domain: "enrichment",
        provenance: "google-places",
        title: "Google listing beverage flags present; the restaurant's own record doesn't state a wine program",
        detail: `servesWine=${String(a.servesWine)} · servesCocktails=${String(a.servesCocktails)}. Not a cellar depth claim.`,
        action: "Ask about pairing depth and corkage if wine-forward is material to the night.",
        impact: 20,
        confidence: "low",
        situational: true,
      });
    }
  }

  /* --- Venue website: dress / group / dietary / reservation platform --- */
  if (dressThin && site?.dressCode) {
    push({
      id: "enr-dress-site",
      layer: "watch",
      domain: "enrichment",
      provenance: "site-scrape",
      title: "Dress note from the venue's website",
      detail: site.dressCode,
      action:
        s.occasion === "Business dining" || s.occasion === "Celebration"
          ? "Confirm the code on the official page before you dress for the room."
          : "Treat as a lead only; re-read the restaurant's own dress note.",
      impact: s.occasion === "Business dining" || s.occasion === "Celebration" ? 34 : 18,
      confidence: "low",
      situational: false,
    });
  }

  if (groupThin && (site?.groupPolicy || site?.groupPolicyLanguage?.length)) {
    push({
      id: "enr-group-site",
      layer: "watch",
      domain: "enrichment",
      provenance: "site-scrape",
      title: "Group-policy note from the venue's website",
      detail:
        site.groupPolicy ||
        (site.groupPolicyLanguage ?? []).slice(0, 2).map(quoteText).join(" · ") ||
        "Group policy language present on the venue's pages.",
      action: "Confirm deposits, set menus, and cut-off times on the official group path.",
      impact: c("Large party (6+)") || (s.partySize ?? 0) >= 6 ? 42 : 22,
      confidence: "low",
      situational: c("Large party (6+)") || (s.partySize ?? 0) >= 6,
    });
  }

  if (dietThin && site?.dietaryLanguage?.length) {
    push({
      id: "enr-diet-site",
      layer: "watch",
      domain: "enrichment",
      provenance: "site-scrape",
      title: "Dietary wording from the venue's website",
      detail: site.dietaryLanguage.slice(0, 3).map(quoteText).join(" · "),
      action: c("Severe allergy / celiac")
        ? "Website text is not a kitchen guarantee — name the allergen and confirm cross-contact practice live."
        : "Read the official dietary note and confirm before inviting restricted guests.",
      impact: c("Severe allergy / celiac") ? 36 : 22,
      confidence: "low",
      situational: c("Severe allergy / celiac"),
    });
  }

  if (site?.reservationPlatform && !r.bookingPlatforms.length) {
    push({
      id: "enr-booking-site",
      layer: "unknown",
      domain: "enrichment",
      provenance: "site-scrape",
      title: `Booking path listed on the venue's website: ${site.reservationPlatform}`,
      detail: site.reservationUrl || "Reservation platform listed on the venue's website only.",
      action: "Open the official reservation page and confirm inventory for your party and date.",
      impact: 20,
      confidence: "low",
      situational: false,
    });
  }

  /* Cap volume — enrichment should not drown first-party findings.
     Rank first so the situational, higher-impact signals survive the cap. */
  return f
    .slice()
    .sort(
      (a, b) =>
        Number(b.situational) - Number(a.situational) || b.impact - a.impact,
    )
    .slice(0, 8);
}


export type OwnedQuote = {
  quote: string;
  sourceUrl?: string;
};

export type OwnedQuoteGroup = {
  label: string;
  kind: string;
  /** Structured first-party language vs page/schema quotes that are not applied as facts. */
  applied: boolean;
  quotes: OwnedQuote[];
};

function toOwnedQuotes(values: SiteLanguage[] | undefined): OwnedQuote[] {
  if (!values?.length) return [];
  const out: OwnedQuote[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const quote = quoteText(value).trim();
    if (!quote || seen.has(quote)) continue;
    seen.add(quote);
    const sourceUrl = typeof value === "object" ? value.sourceUrl : undefined;
    out.push(sourceUrl ? { quote, sourceUrl } : { quote });
  }
  return out;
}

/**
 * First-party website language already extracted onto the enrichment record.
 * The leveling pass writes structured hours, telephone, price, cuisine, menu
 * and reservation paths onto empty dataset fields. Remaining quotes stay
 * labeled on the case file.
 */
export function ownedSiteEvidence(slug: string): {
  present: boolean;
  completeness: number | null;
  matchStatus: string | null;
  pagesRead: number;
  retrievedAt: string | null;
  menuUrl?: string;
  reservationUrl?: string;
  reservationPlatform?: string;
  groups: OwnedQuoteGroup[];
  sourceUrls: string[];
} {
  const enr = getEnrichment(slug);
  const site = enr?.site;
  if (!enr || !site) {
    return {
      present: false,
      completeness: enr?.meta?.completeness ?? null,
      matchStatus: enr?.meta?.matchStatus ?? null,
      pagesRead: 0,
      retrievedAt: enr?.meta?.lastEnrichedAt ?? null,
      groups: [],
      sourceUrls: [],
    };
  }

  const groups: OwnedQuoteGroup[] = [];
  const push = (
    label: string,
    kind: string,
    values: SiteLanguage[] | undefined,
    applied: boolean,
    extra?: string[],
  ) => {
    const quotes = [
      ...toOwnedQuotes(values),
      ...(extra ?? [])
        .map((quote) => quote.trim())
        .filter(Boolean)
        .map((quote) => ({ quote })),
    ];
    const seen = new Set<string>();
    const unique = quotes.filter((q) => {
      if (seen.has(q.quote)) return false;
      seen.add(q.quote);
      return true;
    });
    if (unique.length) groups.push({ label, kind, applied, quotes: unique.slice(0, 8) });
  };

  push("Hours language", "hours", site.hoursLanguage, true);
  push("Telephone", "telephone", site.telephoneLanguage, true);
  push("Price language", "price", site.priceLanguage, true);
  push("Cuisine language", "cuisine", site.cuisineLanguage, true);
  push("Dietary language", "dietary", site.dietaryLanguage, true);
  push("Accessibility language", "access", site.accessibilityLanguage, true);
  push(
    "Group policy",
    "group",
    site.groupPolicyLanguage,
    true,
    site.groupPolicy ? [site.groupPolicy] : [],
  );
  push("Dress note", "dress", site.dressCode ? [site.dressCode] : [], true);
  push("Cancellation language", "cancel", site.cancellationLanguage, true);
  push("Page / schema quotes", "jsonld", site.jsonLdLanguage, false);

  return {
    present: groups.length > 0 || Boolean(site.menuUrl || site.reservationUrl || site.pagesRead),
    completeness: enr.meta?.completeness ?? null,
    matchStatus: enr.meta?.matchStatus ?? null,
    pagesRead: site.pagesRead ?? 0,
    retrievedAt: site.retrievedAt ?? enr.meta?.lastEnrichedAt ?? null,
    ...(site.menuUrl ? { menuUrl: site.menuUrl } : {}),
    ...(site.reservationUrl ? { reservationUrl: site.reservationUrl } : {}),
    ...(site.reservationPlatform ? { reservationPlatform: site.reservationPlatform } : {}),
    groups,
    sourceUrls: site.sourceUrls ?? [],
  };
}

/** Compact audit panel data for case files. */
export function enrichmentAudit(slug: string): {
  present: boolean;
  completeness: number | null;
  matchStatus: string | null;
  lastEnrichedAt: string | null;
  sources: string[];
  signals: string[];
} {
  const enr = getEnrichment(slug);
  if (!enr) {
    return {
      present: false,
      completeness: null,
      matchStatus: null,
      lastEnrichedAt: null,
      sources: [],
      signals: [],
    };
  }
  const signals: string[] = [];
  const g = enr.google;
  const site = enr.site;
  if (g?.accessibility) signals.push(`Google access: ${accessLabels(g.accessibility).join(", ") || "flags present"}`);
  if (g?.parking) {
    const p = parkingLabels(g.parking);
    if (p.length) signals.push(`Google parking: ${p.join(", ")}`);
  }
  if (g?.hours?.length) signals.push("Google structured hours");
  if (g?.priceBand) signals.push(`Google price band ${g.priceBand}`);
  if (g?.amenities?.outdoorSeating) signals.push("Google outdoor seating");
  if (g?.amenities?.goodForGroups) signals.push("Google goodForGroups");
  if (site?.reservationPlatform) signals.push(`Venue website platform ${site.reservationPlatform}`);
  if (site?.hoursLanguage?.length) signals.push("Venue website hours language");
  if (site?.telephoneLanguage?.length) signals.push("Venue website telephone");
  if (site?.priceLanguage?.length) signals.push("Venue website price language");
  if (site?.dietaryLanguage?.length) signals.push("Venue website dietary language");
  if (site?.accessibilityLanguage?.length) signals.push("Venue website accessibility language");
  if (site?.groupPolicy || site?.groupPolicyLanguage?.length) signals.push("Venue website group policy");
  if (site?.dressCode) signals.push("Venue website dress note");
  if (site?.jsonLdLanguage?.length) signals.push("Venue website page quotes (JSON-LD / meta / hydration; not applied as facts)");
  if (enr.summary?.text) signals.push("Model summary (audit only)");

  const sources: string[] = [];
  if (g?.retrievedAt) sources.push(`Google listing · ${g.retrievedAt}`);
  if (site?.retrievedAt) sources.push(`Venue website · ${site.retrievedAt}`);
  for (const u of site?.sourceUrls ?? []) sources.push(u);

  return {
    present: true,
    completeness: enr.meta?.completeness ?? null,
    matchStatus: enr.meta?.matchStatus ?? null,
    lastEnrichedAt: enr.meta?.lastEnrichedAt ?? null,
    sources,
    signals,
  };
}
