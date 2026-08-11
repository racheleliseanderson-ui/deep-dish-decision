/**
 * Labeled third-party enrichment join.
 *
 * enrichment.json is intentionally separate from first-party dataset fields.
 * Signals surface only as Watch/Unknown findings with explicit provenance —
 * never as facts, never into critical/fail-closed paths, never overwriting
 * first-party values.
 */
import raw from "@/data/enrichment.json";
import type { Finding, Situation } from "@/lib/intelligence";
import type { RestaurantRecord } from "@/lib/dataset";

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

export type EnrichmentSite = {
  menuUrl?: string;
  reservationUrl?: string;
  reservationPlatform?: string;
  dietaryLanguage?: string[];
  accessibilityLanguage?: string[];
  groupPolicy?: string;
  groupPolicyLanguage?: string[];
  dressCode?: string;
  cancellationLanguage?: string[];
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
  confidence?: number;
  nameScore?: number;
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

const file = raw as unknown as EnrichmentFile;
const bySlug = new Map(Object.entries(file.records ?? {}));

export const enrichmentGeneratedAt = file.generatedAt ?? null;
export const enrichmentCount = bySlug.size;

export function getEnrichment(slug: string): EnrichmentRecord | null {
  return bySlug.get(slug) ?? null;
}

export function hasEnrichment(slug: string): boolean {
  return bySlug.has(slug);
}

const NOT_STATED = ["Not stated", "Direct confirmation required", "Route details unknown"];

function isThin(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v.length < 40 ||
    v.includes("not stated") ||
    v.includes("not published") ||
    v.includes("were not")
  );
}

function hoursLine(hours: EnrichmentGoogle["hours"]): string | null {
  if (!hours?.length) return null;
  const open = hours
    .filter((h) => h.intervals?.length)
    .map((h) => {
      const spans = h.intervals.map((i) => `${i.open}–${i.close}`).join(", ");
      return `${h.day.slice(0, 3)} ${spans}`;
    });
  if (!open.length) return "Google Places hours list no open intervals (closed or unlisted).";
  return open.slice(0, 4).join(" · ") + (open.length > 4 ? " · …" : "");
}

function parkingLabels(p: GoogleParking | undefined): string[] {
  if (!p) return [];
  const labels: string[] = [];
  if (p["freeParkingLot"]) labels.push("free lot");
  if (p["paidParkingLot"]) labels.push("paid lot");
  if (p["freeStreetParking"]) labels.push("free street");
  if (p["paidStreetParking"]) labels.push("paid street");
  if (p["valetParking"]) labels.push("valet");
  if (p["freeGarageParking"]) labels.push("free garage");
  if (p["paidGarageParking"]) labels.push("paid garage");
  return labels;
}

function accessLabels(a: GoogleAccessibility | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (a.wheelchairAccessibleEntrance === true) out.push("wheelchairAccessibleEntrance");
  if (a.wheelchairAccessibleEntrance === false) out.push("entrance not marked accessible");
  if (a.wheelchairAccessibleParking === true) out.push("wheelchairAccessibleParking");
  if (a.wheelchairAccessibleRestroom === true) out.push("wheelchairAccessibleRestroom");
  if (a.wheelchairAccessibleRestroom === false) out.push("restroom not marked accessible");
  if (a.wheelchairAccessibleSeating === true) out.push("wheelchairAccessibleSeating");
  return out;
}

/**
 * Build labeled enrichment findings. Layers are only "watch" | "unknown".
 * Never "critical" — third-party signals must not drive fail-closed.
 */
export function buildEnrichmentFindings(
  r: RestaurantRecord,
  s: Situation,
): Finding[] {
  const enr = getEnrichment(r.slug);
  if (!enr) return [];

  const f: Finding[] = [];
  const g = enr.google;
  const site = enr.site;
  const c = (x: string) => s.constraints.includes(x as never);
  const push = (x: Finding) =>
    f.push({
      ...x,
      provenance:
        x.provenance ??
        (x.id.includes("site") ? "site-scrape" : x.id.includes("google") || x.id.startsWith("enr-") ? "google-places" : "enrichment"),
    });

  const accessThin =
    r.accessibilityTags.some((t) => NOT_STATED.includes(t)) || isThin(r.accessibilityState);
  const parkingThin = isThin(r.parkingTransit);
  const dressThin = isThin(r.dressCode);
  const hoursThin = isThin(r.hoursSummary);
  const priceThin = isThin(r.priceDetails) || r.priceTags.includes("Conflicting official price");
  const groupThin = isThin(r.groupDetails);
  const dietThin =
    r.dietaryTags.some((t) => NOT_STATED.includes(t)) || isThin(r.dietaryDetails);

  /* --- Google accessibility (only when first-party is thin) ---------- */
  if (accessThin && g?.accessibility) {
    const labels = accessLabels(g.accessibility);
    if (labels.length) {
      const mobility = c("Mobility / step-free needs");
      push({
        id: "enr-access-google",
        layer: "watch",
        domain: "enrichment",
        title: `Google Places reports ${labels[0]}${labels.length > 1 ? ` (+${labels.length - 1})` : ""}`,
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

  /* --- Site-scraped accessibility language --------------------------- */
  if (accessThin && site?.accessibilityLanguage?.length) {
    push({
      id: "enr-access-site",
      layer: "watch",
      domain: "enrichment",
      title: "Site scrape notes accessibility language",
      detail: site.accessibilityLanguage.slice(0, 3).join(" · "),
      action:
        "Read the official page, then confirm the live route — scrape text is not a guarantee of step-free access.",
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
        title: `Google Places parking signals: ${labels.join(", ")}`,
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
        title: "Google Places structured hours available (first-party hours thin)",
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
      title: `Google price band ${g.priceBand ?? g.priceLevel} — first-party price thin`,
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
        title: "Google Places reports outdoor seating; first-party record is silent",
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
        title: "Google Places flags goodForGroups — first-party group path thin",
        detail: "Directory amenity only. Deposits, set menus, and max table size still need first-party confirmation.",
        action: "Call for the large-party path before proposing this record to the group.",
        impact: 40,
        confidence: "low",
        situational: true,
      });
    }
    if (a.servesVegetarianFood === true && (c("Severe allergy / celiac") || dietThin) && dietThin) {
      push({
        id: "enr-veg",
        layer: "unknown",
        domain: "enrichment",
        title: "Google Places reports vegetarian options; allergy/dietary policy still thin first-party",
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
        title: "Google Places beverage flags present; first-party wine program thin",
        detail: `servesWine=${String(a.servesWine)} · servesCocktails=${String(a.servesCocktails)}. Not a cellar depth claim.`,
        action: "Ask about pairing depth and corkage if wine-forward is material to the night.",
        impact: 20,
        confidence: "low",
        situational: true,
      });
    }
  }

  /* --- Site scrape: dress / group / dietary / reservation platform --- */
  if (dressThin && site?.dressCode) {
    push({
      id: "enr-dress-site",
      layer: "watch",
      domain: "enrichment",
      title: "Site scrape notes dress language; first-party dress field thin",
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
      title: "Site scrape notes group policy language",
      detail:
        site.groupPolicy ||
        (site.groupPolicyLanguage ?? []).slice(0, 2).join(" · ") ||
        "Group policy language present on scraped pages.",
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
      title: "Site scrape notes dietary language; first-party dietary field thin",
      detail: site.dietaryLanguage.slice(0, 3).join(" · "),
      action: c("Severe allergy / celiac")
        ? "Scrape language is not a kitchen guarantee — name the allergen and confirm cross-contact practice live."
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
      title: `Site scrape reports ${site.reservationPlatform} booking path`,
      detail: site.reservationUrl || "Reservation platform inferred from site scrape only.",
      action: "Open the official reservation page and confirm inventory for your party and date.",
      impact: 20,
      confidence: "low",
      situational: false,
    });
  }

  /* Cap volume — enrichment should not drown first-party findings */
  return f.slice(0, 8);
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
  if (site?.reservationPlatform) signals.push(`Site platform ${site.reservationPlatform}`);
  if (site?.dietaryLanguage?.length) signals.push("Site dietary language");
  if (site?.accessibilityLanguage?.length) signals.push("Site accessibility language");
  if (site?.groupPolicy || site?.groupPolicyLanguage?.length) signals.push("Site group policy");
  if (site?.dressCode) signals.push("Site dress note");
  if (enr.summary?.text) signals.push("Model summary (audit only)");

  const sources: string[] = [];
  if (g?.retrievedAt) sources.push(`Google Places · ${g.retrievedAt}`);
  if (site?.retrievedAt) sources.push(`Site scrape · ${site.retrievedAt}`);
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
