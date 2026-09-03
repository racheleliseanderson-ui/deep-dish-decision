/**
 * The published cross-contact read.
 *
 * Deep Dish holds first-party text and nothing else, so this module does the
 * only honest thing available: it reads what the restaurant published and
 * sorts it into three states. Nothing here infers, scores, or asks a model.
 * If a kitchen never wrote about allergens, the answer is "silent", and
 * "silent" stays "silent".
 *
 * The distinction that matters is between the first two states. "We mark the
 * gluten-free dishes" is a menu fact. "Tell your server about allergies and we
 * cannot promise an allergen-free kitchen" is a practice. Collapsing those two
 * into one green tick is the exact failure this product exists to avoid, so
 * they are separate states with separate labels and they never merge.
 *
 * Deliberately NOT a safety signal. `published` means a claim exists in the
 * restaurant's own words. Nobody here has verified it.
 */
import { isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";

export type CrossContactState = "published" | "dietary-only" | "silent";

export type CrossContactRead = {
  state: CrossContactState;
  /** The stored sentence the state was read out of. Null when nothing was stated. */
  evidence: string | null;
  /** Which stored field that sentence came from. */
  field: "dietaryDetails" | "menuSummary" | "practicalNotes" | null;
};

/**
 * Sentences written by Deep Dish, not by the restaurant.
 *
 * The corpus stores our own hedges and our own negative findings inside the
 * same field as the restaurant's wording — "cross-contact suitability still
 * requires direct confirmation" is us, not them. Left in, every one of those
 * lines would read as published evidence and the feature would claim ~360
 * rooms have an allergen practice when the real number is a fraction of that.
 * Strip them first; classify only what is left.
 */
const HOUSE_VOICE: RegExp[] = [
  /\bdirect confirmation\b/i,
  /\brequires? confirmation\b/i,
  /confirmation remains necessary/i,
  /\b(was|were) not published\b|\bdid not publish\b|\bdo(es)? not publish\b/i,
  /\bnot confirmed\b|\bnot established\b|\bnot found\b|\bnot retriev/i,
  /\bno comprehensive\b|\bnot published\b|\bnot stated\b/i,
  /\bindividual (allerg|needs|dietary|accommodation)/i,
  /\bguests? with [^.]{0,40}(needs|restrictions) should contact\b/i,
  /\bcontact the restaurant (before|directly)/i,
  /\bthe (reviewed|retrieved) first-party pages\b/i,
  /\bofficial pages do not\b/i,
];

/** The pipeline's marker for a verbatim lift off the restaurant's own pages. */
const QUOTE_MARKER = /Dietary wording from the restaurant['’]s own pages:\s*/i;

/** Unambiguous allergen-handling language. Enough on its own, anywhere it appears. */
const PRACTICE_STRONG: RegExp[] = [
  /cross[-\s]?contact/i,
  /cross[-\s]?contamination/i,
  /shared (fryer|fryers|kitchen|equipment|surface|surfaces|grill)/i,
  /dedicated (fryer|fryers|kitchen|prep)/i,
  /allergen[-\s]?free/i,
  /allergen (guide|menu|chart|information|notice|notices|list|matrix|statement|policy)/i,
  /\bceliac\b/i,
];

/**
 * Allergen-handling language that only counts inside the dietary field, where
 * the surrounding sentence is about diet. The same words in a menu blurb are
 * usually a caption, not a practice.
 */
const PRACTICE_LOCAL: RegExp[] = [
  /allerg(y|ies|en)s? (policy|policies|protocol|procedure)/i,
  /(inform|notify|advise|alert|tell|let)[^.]{0,60}allerg/i,
  /allerg[^.]{0,90}\b(inform|notify|advise|alert|accommodat|guarantee|liable|liability|before ordering|in advance|when booking|prior to|not listed)/i,
  /\b(inquire|ask)[^.]{0,60}allerg/i,
  /gluten[-\s]free (kitchen|facility|fryer)/i,
];

/** A named allergen next to a stated limit is a practice statement, however blunt. */
const ALLERGEN_NAME =
  /\b(peanut|tree nut|nuts?|shellfish|gluten|wheat|dairy|milk|eggs?|soy|sesame|fish|allium|crustacean)\b/i;
const STATED_LIMIT =
  /\b(cannot|can not|can't|unable to|will not|do not)\b[^.]{0,40}\b(accommodat|guarantee|remov|substitut)/i;

/** Dietary accommodation without any claim about how the kitchen handles it. */
const DIETARY: RegExp[] = [
  /gluten[-\s]?free/i,
  /\bvegan\b/i,
  /\bvegetarian\b/i,
  /dairy[-\s]?free/i,
  /nut[-\s]?free/i,
  /shellfish[-\s]?free/i,
  /plant[-\s]?based/i,
  /plant[-\s]?forward/i,
  /vegetable[-\s]?forward/i,
  /meat[-\s]?free/i,
  /pescatarian/i,
  /\bhalal\b/i,
  /\bkosher\b/i,
  /dietary (restriction|need|request|accommodation|modification|option|polic)/i,
  /\bsubstitut/i,
  /\bmodification/i,
  /\ballerg/i,
  /\bdiet\b/i,
];

/** Split on sentence ends and on the bullet the scraper leaves between lifted lines. */
function sentences(value: string): string[] {
  return String(value)
    .split(/(?<=[.!?·•])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The restaurant's own sentences from one stored field, with our voice removed. */
function firstPartySentences(value: string | null | undefined): string[] {
  if (isUnstated(value)) return [];
  let text = String(value).trim();
  const quote = QUOTE_MARKER.exec(text);
  if (quote) text = text.slice(quote.index + quote[0].length);
  return sentences(text).filter((s) => !HOUSE_VOICE.some((re) => re.test(s)));
}

const matches = (list: RegExp[], s: string) => list.some((re) => re.test(s));

const isPracticeStrong = (s: string) => matches(PRACTICE_STRONG, s);
const isPracticeLocal = (s: string) =>
  matches(PRACTICE_LOCAL, s) || (ALLERGEN_NAME.test(s) && STATED_LIMIT.test(s));

const SILENT: CrossContactRead = { state: "silent", evidence: null, field: null };

const cache = new WeakMap<RestaurantRecord, CrossContactRead>();

/**
 * Classify one record. Pure, cheap, and cached per record object because the
 * home route re-ranks a whole region on every situation change.
 */
export function readCrossContact(record: RestaurantRecord): CrossContactRead {
  const hit = cache.get(record);
  if (hit) return hit;

  const dietary = firstPartySentences(record.dietaryDetails);
  let read: CrossContactRead = SILENT;

  const practice = dietary.find((s) => isPracticeStrong(s) || isPracticeLocal(s));
  if (practice) {
    read = { state: "published", evidence: practice, field: "dietaryDetails" };
  } else {
    const secondary = (["menuSummary", "practicalNotes"] as const)
      .map((field) => {
        const found = firstPartySentences(record[field]).find(isPracticeStrong);
        return found ? { state: "published" as const, evidence: found, field } : null;
      })
      .find(Boolean);
    if (secondary) {
      read = secondary;
    } else {
      const diet = dietary.find((s) => matches(DIETARY, s));
      if (diet) read = { state: "dietary-only", evidence: diet, field: "dietaryDetails" };
    }
  }

  cache.set(record, read);
  return read;
}

/** Chip tone per state. Never `verified`: a published claim is not a clean kitchen. */
export const CROSS_CONTACT_TONE: Record<CrossContactState, "accent" | "watch" | "unknown"> = {
  published: "accent",
  "dietary-only": "watch",
  silent: "unknown",
};

/** Short label for a chip. */
export const CROSS_CONTACT_LABEL: Record<CrossContactState, string> = {
  published: "Allergen practice published",
  "dietary-only": "Dietary options only",
  silent: "Nothing published on diet",
};

/** One line of plain explanation, for a card or a record header. */
export const CROSS_CONTACT_NOTE: Record<CrossContactState, string> = {
  published:
    "The restaurant has written something down about allergens or cross-contact. It is their claim, in their words.",
  "dietary-only": "Dietary options are published. How the kitchen keeps them apart is not.",
  silent: "The restaurant's own pages say nothing about diet or allergens.",
};

export type CrossContactSplit<T> = {
  published: T[];
  dietaryOnly: T[];
  silent: T[];
};

/** Partition a ranked list into the three states, preserving the incoming order. */
export function splitByCrossContact<T>(
  rows: T[],
  pick: (row: T) => RestaurantRecord,
): CrossContactSplit<T> {
  const out: CrossContactSplit<T> = { published: [], dietaryOnly: [], silent: [] };
  for (const row of rows) {
    const state = readCrossContact(pick(row)).state;
    if (state === "published") out.published.push(row);
    else if (state === "dietary-only") out.dietaryOnly.push(row);
    else out.silent.push(row);
  }
  return out;
}
