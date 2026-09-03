/**
 * Ten ordinary-diner questions, answered only where evidence supports it.
 * Sources stay labeled. No fabricated consensus. No authenticity claims
 * from anonymous reviews. Rankings are not driven from this module.
 */
import { isUnstated } from "@/lib/case-depth";
import type { RestaurantRecord } from "@/lib/dataset";
import { firstPoint, statedText } from "@/lib/consumer-snapshot";
import { buildFoodIntel } from "@/lib/food-intel";
import { getInspection, inspectionLayerLoaded } from "@/lib/inspections";
import { buildReputation, getListingSample, getResearchedPattern } from "@/lib/reputation";

export type AnswerSource =
  "firstPartyEvidence" | "publicReputationEvidence" | "editorialAnalysis" | "notOnFile";

export type DinerAnswer = {
  id: string;
  n: number;
  question: string;
  answer: string;
  source: AnswerSource;
  sourceLabel: string;
  open: boolean;
};

export function buildDinerAnswers(record: RestaurantRecord): DinerAnswer[] {
  const food = buildFoodIntel(record);
  const rep = buildReputation(record.slug);
  const listing = getListingSample(record.slug);

  return [
    foodGood(record, food, rep),
    worthMoney(record),
    overallExperience(record, rep),
    whatPeopleThink(rep),
    service(record, rep),
    convenience(record, listing, rep),
    dietary(record),
    menuLike(record, food, rep),
    cleanTrustworthy(record.slug),
    whatMakesDifferent(record, food),
  ];
}

function foodGood(
  record: RestaurantRecord,
  food: ReturnType<typeof buildFoodIntel>,
  rep: ReturnType<typeof buildReputation>,
): DinerAnswer {
  const identity = food.culinaryIdentity;
  const parts: string[] = [];
  if (identity) {
    parts.push(`The restaurant describes itself as ${uncap(identity, properOpeners(record))}`);
  } else {
    parts.push("Culinary identity is not stated on the restaurant's own pages.");
  }
  if (food.signatureMentions.length) {
    parts.push(`Pages mention ${food.signatureMentions.slice(0, 2).join("; ")}.`);
  }
  if (rep.recurringPraise.length) {
    parts.push(`Repeated recent praise (public-review pattern): ${rep.recurringPraise[0]}.`);
  } else if (rep.evidenceStrength === "listing_sample_only") {
    parts.push(
      "A directory rating is on file as context only — that is not proof the food is good, and it is not used to rank this record.",
    );
  } else {
    parts.push("No public-review food-quality pattern is on file.");
  }
  return {
    id: "food",
    n: 1,
    question: "Is the food actually good?",
    answer: parts.join(" "),
    source: identity ? "firstPartyEvidence" : "notOnFile",
    sourceLabel: identity ? "Restaurant-owned description · not a quality verdict" : "Not on file",
    open: !identity,
  };
}

function worthMoney(record: RestaurantRecord): DinerAnswer {
  const raw = statedText(record.priceDetails);
  if (!raw) {
    return q(
      "spend",
      2,
      "Is it worth the money?",
      "Current pricing is not stated on the restaurant's own pages. Confirm the live menu and any service charge before you treat an entrée price as the night.",
      "notOnFile",
      "Not on file",
      true,
    );
  }
  const dollars = [...raw.matchAll(/\$([0-9][0-9,]*(?:\.[0-9]{2})?)/g)].map((m) =>
    Number((m[1] ?? "0").replace(/,/g, "")),
  );
  const service = raw.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:service|auto[\s-]?grat|gratuity)/i);
  const tasting = /tasting|six-course|multi-course|prix[\s-]?fixe/i.test(
    `${record.menuSummary} ${raw}`,
  );
  const bits: string[] = [];
  if (dollars.length === 1 && service) {
    const base = dollars[0]!;
    const pct = Number(service[1]);
    bits.push(
      `Published ${tasting ? "tasting" : "price"} is $${base} per guest, plus a stated ${pct}% service charge (about $${Math.round(base * (1 + pct / 100))} before drinks).`,
    );
  } else {
    bits.push(firstPoint(raw, 200) ?? raw);
  }
  bits.push("That is the restaurant's published figure, not a value verdict.");
  return q(
    "spend",
    2,
    "Is it worth the money?",
    bits.join(" "),
    "firstPartyEvidence",
    "Restaurant-owned pricing",
    false,
  );
}

function overallExperience(
  record: RestaurantRecord,
  rep: ReturnType<typeof buildReputation>,
): DinerAnswer {
  const atmo = firstPoint(record.atmosphereSummary, 180);
  const tags = experienceTags(record);
  if (!atmo && !tags.length && !rep.operationalNote) {
    return q(
      "experience",
      3,
      "What is the overall experience?",
      "Room character is not stated on the restaurant's own pages.",
      "notOnFile",
      "Not on file",
      true,
    );
  }
  const tagLine = tags.length ? ` Diner-facing tags on file: ${tags.join(", ")}.` : "";
  const pause = rep.operationalNote ? ` ${rep.operationalNote}` : "";
  return q(
    "experience",
    3,
    "What is the overall experience?",
    `${atmo ?? "Atmosphere is thinly stated."}${tagLine}${pause}`,
    "firstPartyEvidence",
    "Restaurant-owned atmosphere + recorded bands",
    false,
  );
}

function whatPeopleThink(rep: ReturnType<typeof buildReputation>): DinerAnswer {
  if (rep.recurringPraise.length || rep.recurringComplaints.length) {
    const bits = [rep.patternSummary];
    if (rep.recurringPraise.length)
      bits.push(`Repeated recent praise: ${rep.recurringPraise.join("; ")}.`);
    if (rep.recurringComplaints.length)
      bits.push(`Recurring complaint: ${rep.recurringComplaints.join("; ")}.`);
    if (rep.sampleSize)
      bits.push(
        `Sample ${rep.sampleSize.toLocaleString()} · ${rep.recency ?? "recency unstated"}.`,
      );
    bits.push("This pattern does not rank the record.");
    return q(
      "people",
      4,
      "What do other people think?",
      bits.join(" "),
      "publicReputationEvidence",
      "Public-review pattern · not a star ranking",
      false,
    );
  }
  return q(
    "people",
    4,
    "What do other people think?",
    rep.patternSummary,
    rep.evidenceStrength === "none" ? "notOnFile" : "publicReputationEvidence",
    "Directory sample only",
    true,
  );
}

function service(record: RestaurantRecord, rep: ReturnType<typeof buildReputation>): DinerAnswer {
  const stated = firstPoint(record.serviceSummary, 180);
  const researched =
    rep.servicePattern ??
    (rep.consistencySignal ? `Public-review pattern: ${rep.consistencySignal}` : null);
  const bits: string[] = [];
  bits.push(
    stated
      ? `Stated service format: ${uncap(stated)}`
      : "Service format is not stated on the restaurant's own pages.",
  );
  bits.push(
    researched
      ? researched.endsWith(".")
        ? researched
        : `${researched}.`
      : "Repeated diner service experience (attentive, rushed, recovery) is not on file as a public-review pattern.",
  );
  return q(
    "service",
    5,
    "How good is the service?",
    bits.join(" "),
    stated ? "firstPartyEvidence" : "notOnFile",
    "Restaurant-stated format, separate from diner-experience patterns",
    !stated,
  );
}

function convenience(
  record: RestaurantRecord,
  listing: ReturnType<typeof getListingSample>,
  rep: ReturnType<typeof buildReputation>,
): DinerAnswer {
  const parts: string[] = [];
  const res = firstPoint(record.reservationDetails, 120);
  if (res) parts.push(res);
  else if (record.reservationUrl)
    parts.push("A reservation path is on file; confirm platform and lead time live.");
  else parts.push("No booking path is stated.");
  if (!isUnstated(record.parkingTransit)) parts.push(firstPoint(record.parkingTransit, 90) ?? "");
  if (!isUnstated(record.typicalMealLength))
    parts.push(firstPoint(record.typicalMealLength, 80) ?? "");
  if (!isUnstated(record.accessibilityState))
    parts.push(firstPoint(record.accessibilityState, 90) ?? "");
  if (rep.waitPattern) parts.push(`Public-review wait pattern: ${uncap(rep.waitPattern)}`);
  if (rep.operationalNote) parts.push(rep.operationalNote);
  void listing;
  const text = parts.filter(Boolean).join(" ");
  return q(
    "convenience",
    6,
    "How convenient is it?",
    text,
    res ? "firstPartyEvidence" : "notOnFile",
    "Booking, arrival, meal length, access",
    !res,
  );
}

function dietary(record: RestaurantRecord): DinerAnswer {
  const raw = statedText(record.dietaryDetails);
  if (!raw) {
    return q(
      "dietary",
      7,
      "Does it fit dietary needs?",
      "Dietary handling is not stated. Do not infer allergy safety from cuisine type.",
      "notOnFile",
      "Not on file",
      true,
    );
  }
  const allergy = /celiac|cross-?contact|allerg|cannot be removed/i.test(raw);
  const option = /vegetarian|vegan|gluten-?free/i.test(raw);
  let answer = firstPoint(raw, 220) ?? raw;
  if (option && !allergy) {
    answer +=
      " A vegetarian, vegan, or gluten-free marker is not a celiac or severe-allergy protocol.";
  } else if (allergy) {
    answer += " Confirm the live kitchen rule before a celiac or severe-allergy visit.";
  }
  return q(
    "dietary",
    7,
    "Does it fit dietary needs?",
    answer,
    "firstPartyEvidence",
    "Restaurant-owned dietary language",
    false,
  );
}

function menuLike(
  record: RestaurantRecord,
  food: ReturnType<typeof buildFoodIntel>,
  rep: ReturnType<typeof buildReputation>,
): DinerAnswer {
  const bits: string[] = [];
  if (food.menuFormat) bits.push(`Format: ${food.menuFormat}.`);
  if (food.whatToOrder) bits.push(food.whatToOrder);
  if (food.beverageProgram) bits.push(`Drinks: ${uncap(food.beverageProgram)}`);
  if (rep.dishesRecommended.length) {
    bits.push(
      `Public-review pattern names: ${rep.dishesRecommended.slice(0, 3).join("; ")}. Confirm against the current menu.`,
    );
  }
  if (!bits.length) {
    return q(
      "menu",
      8,
      "What is the menu like?",
      "Menu style is not stated on the restaurant's own pages.",
      "notOnFile",
      "Not on file",
      true,
    );
  }
  return q(
    "menu",
    8,
    "What is the menu like?",
    bits.join(" "),
    "firstPartyEvidence",
    "Restaurant-owned menu language",
    false,
  );
}

function cleanTrustworthy(slug: string): DinerAnswer {
  const insp = getInspection(slug);
  const researched = getResearchedPattern(slug);
  if (!insp) {
    const extra = researched?.cleanlinessPattern
      ? ` Public-review cleanliness commentary on file: ${researched.cleanlinessPattern}`
      : " Public-review cleanliness commentary is shown only as a labeled pattern, and none is on file.";
    // Two different facts were wearing the same sentence. With the inspection
    // layer loaded, silence is a statement about this restaurant: nothing
    // matched it. With the layer empty, which is what happens whenever
    // build-consumer-layers.py runs without its source snapshot, silence is a
    // statement about our build, and the record has not been checked at all.
    const layerLoaded = inspectionLayerLoaded();
    const opening = layerLoaded
      ? "No health-inspection record matched this restaurant."
      : "The health-inspection layer is empty in this build, so this restaurant has not been checked against one.";
    return q(
      "trust",
      9,
      "Is it clean and trustworthy?",
      `${opening}${extra} Cleanliness here comes from an inspection record or from nothing at all. Reviews stay on the reputation layer, labeled as reviews.`,
      "notOnFile",
      layerLoaded
        ? "Conservative — no inspection matched"
        : "Conservative — inspection layer not loaded",
      true,
    );
  }
  const closed = insp.closed
    ? " The inspection record flags a closure on that visit."
    : " Not recorded as closed.";
  const red = insp.redViolations.length
    ? ` Red / critical items on that visit: ${insp.redViolations.slice(0, 3).join("; ")}.`
    : " No red / critical items listed on that visit.";
  const grade = insp.grade ? ` Posted grade: ${insp.grade}.` : "";
  const result = insp.latestResult ? ` Latest result: ${insp.latestResult}.` : "";
  const answer = `${insp.jurisdiction} snapshot dated ${insp.latestInspectionDate ?? "unstated"}.${result}${grade}${red}${closed} ${insp.note} This is not a Deep Dish cleanliness score.`;
  return q(
    "trust",
    9,
    "Is it clean and trustworthy?",
    answer,
    "publicReputationEvidence",
    `${insp.jurisdiction} · public record, not a ranking`,
    false,
  );
}

function whatMakesDifferent(
  record: RestaurantRecord,
  food: ReturnType<typeof buildFoodIntel>,
): DinerAnswer {
  if (food.differentiator) {
    return q(
      "different",
      10,
      "What makes it different?",
      food.differentiator,
      "firstPartyEvidence",
      "From culinary identity, room, and format on the case file",
      false,
    );
  }
  return q(
    "different",
    10,
    "What makes it different?",
    "Nothing distinctive is stated beyond generic room language. Deep Dish will not fill that with 'great atmosphere and delicious food.'",
    "notOnFile",
    "Not on file",
    true,
  );
}

function experienceTags(record: RestaurantRecord): string[] {
  const blob =
    `${record.atmosphereSummary ?? ""} ${record.formalityBand ?? ""} ${record.noiseBand ?? ""} ${record.occasionFit ?? ""} ${record.signals?.energy ?? ""}`.toLowerCase();
  const tags: string[] = [];
  const push = (re: RegExp, label: string) => {
    if (re.test(blob)) tags.push(label);
  };
  push(/romantic|intimate|date/, "intimate");
  push(/casual/, "casual");
  push(/upscale|polished|fine dining|formal/, "upscale");
  push(/lively|energetic|high energy|nightclub|animated/, "high energy");
  push(/family/, "family-friendly");
  push(/quiet|conversation|calm/, "conversation-friendly");
  push(/view|lake|skyline|cascade/, "view");
  push(/lounge/, "lounge path");
  return [...new Set(tags)].slice(0, 6);
}

function q(
  id: string,
  n: number,
  question: string,
  answer: string,
  source: AnswerSource,
  sourceLabel: string,
  open: boolean,
): DinerAnswer {
  return { id, n, question, answer, source, sourceLabel, open };
}

/**
 * Words that open a description as ordinary sentence case even though the
 * corpus also files them as cuisine tags. Without this "Contemporary" and
 * "Seasonal" would be protected as names and the capital would survive.
 */
const GENERIC_OPENERS = new Set([
  "contemporary",
  "creative",
  "casual",
  "fine",
  "modern",
  "seasonal",
  "small",
  "tasting",
  "wine",
]);

/** The proper nouns this particular record is entitled to keep capitalised. */
function properOpeners(r: RestaurantRecord): Set<string> {
  const out = new Set<string>();
  for (const source of [
    r.city,
    r.stateProvince,
    r.region,
    r.regionGroup,
    ...(r.cuisineTags ?? []),
  ]) {
    for (const word of String(source ?? "").split(/[^A-Za-z'-]+/)) {
      const key = word.toLowerCase();
      if (key.length > 2 && !GENERIC_OPENERS.has(key)) out.add(key);
    }
  }
  return out;
}

/**
 * Fit a stored sentence into the middle of another one: lowercase its opening
 * letter and leave it with exactly one full stop.
 *
 * It only ever did the second half, despite the name, so
 * `The restaurant describes itself as ${uncap(identity)}` printed a capital
 * mid-clause on every record with a stated culinary identity.
 *
 * The opener is left capitalised when it is a name rather than a sentence
 * start: a word carrying an internal capital ("Italian-American", "PNW"), or
 * one of this record's own places and cuisines ("Seattle destination dining").
 * Lowercasing those would read worse than the bug being fixed.
 */
function uncap(s: string, keep?: Set<string>): string {
  const text = String(s ?? "")
    .trim()
    .replace(/\s*\.+$/, "");
  if (!text) return "";
  const opener = (text.split(/[^A-Za-z'-]+/, 1)[0] ?? "").replace(/^['-]+/, "");
  const isName = /[A-Z]/.test(opener.slice(1)) || (keep?.has(opener.toLowerCase()) ?? false);
  const head = isName ? text : text.charAt(0).toLowerCase() + text.slice(1);
  return `${head}.`;
}
