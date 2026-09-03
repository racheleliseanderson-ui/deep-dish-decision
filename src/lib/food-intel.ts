/**
 * First-party food intelligence.
 *
 * Derived only from restaurant-owned fields already on the case file.
 * Never claims the food is "good". Never mixes review sentiment.
 */
import dishesRaw from "@/data/first-party-dishes.json";
import { isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import { firstPoint, statedText } from "@/lib/consumer-snapshot";

export type FirstPartyFoodIntel = {
  slug: string;
  layer: "firstPartyEvidence";
  culinaryIdentity: string | null;
  menuFormat: string | null;
  signatureMentions: string[];
  strongestCategories: string[];
  beverageProgram: string | null;
  chefOrPov: string | null;
  sourcingClaims: string[];
  differentiator: string | null;
  whatToOrder: string;
};

const FORMAT_PATTERNS: Array<[RegExp, string]> = [
  [
    /six-course|multi-course|tasting|prix[\s-]?fixe|degustation|omakase|kaiseki/i,
    "tasting / set menu",
  ],
  [/lounge menu/i, "dining room plus a separate lounge menu"],
  [/shared plates|shareable|small plates/i, "shared plates"],
  [/a\s*la\s*carte/i, "à la carte"],
  [/brunch/i, "brunch on the program"],
  [/counter/i, "counter service"],
];

const namedFile = dishesRaw as { records: Record<string, string[]> };

export function namedDishesFor(slug: string): string[] {
  return (namedFile.records[slug] ?? []).filter(isDishLike);
}

export function buildFoodIntel(record: RestaurantRecord): FirstPartyFoodIntel {
  const menu = statedText(record.menuSummary) ?? "";
  const cuisine = statedText(record.cuisineContext) ?? "";
  const beverage = statedText(record.beverageDetails);
  const blob = `${cuisine} ${menu} ${statedText(record.serviceSummary) ?? ""}`;

  const formats = FORMAT_PATTERNS.filter(([re]) => re.test(blob)).map(([, label]) => label);
  const menuFormat = formats.length
    ? unique(formats).join("; ")
    : firstPoint(record.menuSummary, 120);

  const signatureMentions = unique([
    ...extractSignatures(`${cuisine} ${menu}`),
    ...namedDishesFor(record.slug),
  ]).slice(0, 5);
  const strongestCategories = (record.cuisineTags ?? [])
    .filter((t) => t && !isUnstated(t))
    .slice(0, 5);
  const chefOrPov = extractChef(cuisine) ?? extractChef(menu);
  const sourcingClaims = extractSourcing(blob);

  const differentiator = buildDifferentiator(record, {
    culinaryIdentity: firstPoint(record.cuisineContext, 160),
    signatureMentions,
    chefOrPov,
  });

  const whatToOrder = signatureMentions.length
    ? `The restaurant's own pages mention: ${signatureMentions.slice(0, 3).join("; ")}.`
    : menuFormat
      ? `No signature dish is named on the restaurant's own pages. Format on file: ${menuFormat}.`
      : "The restaurant has not named a signature dish or a clear menu format on the pages reviewed.";

  return {
    slug: record.slug,
    layer: "firstPartyEvidence",
    culinaryIdentity: firstPoint(record.cuisineContext, 180),
    menuFormat: menuFormat || null,
    signatureMentions,
    strongestCategories,
    beverageProgram: firstPoint(beverage, 140),
    chefOrPov,
    sourcingClaims,
    differentiator,
    whatToOrder,
  };
}

function isDishLike(s: string): boolean {
  const t = s.trim();
  if (t.length < 3 || t.length > 70) return false;
  if (
    /goldbelly|nationwide|farms|hospitality|cuisine rooted|modern approach|wine program|globally inspired|seasonal menu sourced|private dining|welcoming|deep respect|exceptional asian|italian tradition|crafted cocktails|brunch, and dinner|\bstop$|made-from-scratch fare|prime steaks, seafood|delicious/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

function extractSignatures(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?:signature dishes?(?: include| is| are)?|known for|famous for|house[- ]made|house specialty(?: is)?)\s+([^.;:]{4,80})/gi;
  for (const m of text.matchAll(re)) {
    const bit = (m[1] ?? "").trim().replace(/\s+/g, " ");
    if (bit && !/not stated/i.test(bit) && isDishLike(bit)) out.push(bit.replace(/[,.]$/, ""));
  }
  if (/\bhouse-made pasta\b/i.test(text)) out.push("house-made pasta");
  if (/\bhand-made pasta\b/i.test(text)) out.push("hand-made pasta");
  if (/\bbrick-oven pizza\b/i.test(text)) out.push("brick-oven pizza");
  return unique(out).slice(0, 4);
}

function extractChef(text: string): string | null {
  const m = text.match(/\b(?:chef|owner-chef|chef-owner)\s+[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?/);
  return m ? m[0] : null;
}

function extractSourcing(text: string): string[] {
  const hits: string[] = [];
  if (/live-?fire|wood-fired|hearth/i.test(text)) hits.push("live-fire / wood-fired cooking");
  if (/farm|local(?:ly)? sourced|pacific northwest ingredients|seasonal/i.test(text))
    hits.push("seasonal or locally framed ingredients");
  if (/wine cellar|wine program|sommelier/i.test(text)) hits.push("serious wine program");
  if (/house-made|housemade|in-house/i.test(text)) hits.push("house-made elements");
  return unique(hits);
}

function buildDifferentiator(
  record: RestaurantRecord,
  bits: { culinaryIdentity: string | null; signatureMentions: string[]; chefOrPov: string | null },
): string | null {
  const parts: string[] = [];
  if (bits.chefOrPov) parts.push(bits.chefOrPov);
  if (bits.culinaryIdentity) parts.push(bits.culinaryIdentity);
  const atmo = (record.atmosphereSummary ?? "").toLowerCase();
  if (/\bview\b|lake|cascade|skyline|garden|historic/i.test(atmo)) {
    const view = firstPoint(record.atmosphereSummary, 120);
    if (view) parts.push(view);
  }
  if (record.signals?.private && !isUnstated(record.signals.private)) {
    parts.push("Private or semi-private path is on file.");
  }
  if (!parts.length) return null;
  const line = unique(parts).join(" ");
  if (/great atmosphere|delicious food/i.test(line)) return null;
  return line;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
