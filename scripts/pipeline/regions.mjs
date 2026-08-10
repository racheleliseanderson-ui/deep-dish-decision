/**
 * US states + DC and Canadian provinces, name to postal code. Used by the
 * matcher (Google returns "MT", records carry "Montana") and by the coverage
 * console. Population figures are US Census 2023 estimates and drive the
 * expansion order; provinces carry no population because expansion is US-only.
 */

export const STATES = {
  alabama: { code: "AL", population: 5108468 },
  alaska: { code: "AK", population: 733406 },
  arizona: { code: "AZ", population: 7431344 },
  arkansas: { code: "AR", population: 3067732 },
  california: { code: "CA", population: 38965193 },
  colorado: { code: "CO", population: 5877610 },
  connecticut: { code: "CT", population: 3617176 },
  delaware: { code: "DE", population: 1031890 },
  "district of columbia": { code: "DC", population: 678972 },
  florida: { code: "FL", population: 22610726 },
  georgia: { code: "GA", population: 11029227 },
  hawaii: { code: "HI", population: 1435138 },
  idaho: { code: "ID", population: 1964726 },
  illinois: { code: "IL", population: 12549689 },
  indiana: { code: "IN", population: 6862199 },
  iowa: { code: "IA", population: 3207004 },
  kansas: { code: "KS", population: 2940546 },
  kentucky: { code: "KY", population: 4526154 },
  louisiana: { code: "LA", population: 4573749 },
  maine: { code: "ME", population: 1395722 },
  maryland: { code: "MD", population: 6180253 },
  massachusetts: { code: "MA", population: 7001399 },
  michigan: { code: "MI", population: 10037261 },
  minnesota: { code: "MN", population: 5737915 },
  mississippi: { code: "MS", population: 2939690 },
  missouri: { code: "MO", population: 6196156 },
  montana: { code: "MT", population: 1132812 },
  nebraska: { code: "NE", population: 1978379 },
  nevada: { code: "NV", population: 3194176 },
  "new hampshire": { code: "NH", population: 1402054 },
  "new jersey": { code: "NJ", population: 9290841 },
  "new mexico": { code: "NM", population: 2114371 },
  "new york": { code: "NY", population: 19571216 },
  "north carolina": { code: "NC", population: 10835491 },
  "north dakota": { code: "ND", population: 783926 },
  ohio: { code: "OH", population: 11785935 },
  oklahoma: { code: "OK", population: 4053824 },
  oregon: { code: "OR", population: 4233358 },
  pennsylvania: { code: "PA", population: 12961683 },
  "rhode island": { code: "RI", population: 1095962 },
  "south carolina": { code: "SC", population: 5373555 },
  "south dakota": { code: "SD", population: 919318 },
  tennessee: { code: "TN", population: 7126489 },
  texas: { code: "TX", population: 30503301 },
  utah: { code: "UT", population: 3417734 },
  vermont: { code: "VT", population: 647464 },
  virginia: { code: "VA", population: 8715698 },
  washington: { code: "WA", population: 7812880 },
  "west virginia": { code: "WV", population: 1770071 },
  wisconsin: { code: "WI", population: 5910955 },
  wyoming: { code: "WY", population: 584057 },
};

export const PROVINCES = {
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "nova scotia": "NS",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  saskatchewan: "SK",
  yukon: "YT",
  "northwest territories": "NT",
  nunavut: "NU",
};

const CODES = new Map([
  ...Object.entries(STATES).map(([name, v]) => [name, v.code]),
  ...Object.entries(PROVINCES),
]);

/** "Montana" -> "MT", "BC" -> "BC", unknown -> "". */
export function regionCode(nameOrCode) {
  const raw = String(nameOrCode ?? "").trim();
  if (!raw) return "";
  if (raw.length === 2) return raw.toUpperCase();
  return CODES.get(raw.toLowerCase()) ?? "";
}

export const US_STATE_CODES = Object.values(STATES).map((s) => s.code);
