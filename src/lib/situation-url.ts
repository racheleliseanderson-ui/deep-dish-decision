import {
  CONSTRAINTS,
  OCCASIONS,
  emptySituation,
  type Constraint,
  type Occasion,
  type Situation,
} from "@/lib/intelligence";

/**
 * Situations travel in the URL so a refined situation can be shared, reopened,
 * or printed without re-entry. Unknown or malformed values are dropped rather
 * than guessed at.
 */
export function encodeSituation(s: Situation): string {
  const p = new URLSearchParams();
  if (s.occasion) p.set("o", s.occasion);
  if (s.partySize !== null) p.set("p", String(s.partySize));
  if (s.leadDays !== null) p.set("l", String(s.leadDays));
  if (s.constraints.length) p.set("c", s.constraints.join("|"));
  if (s.maxCommitment) p.set("mc", s.maxCommitment);
  if (s.maxPlanningLoad) p.set("mp", s.maxPlanningLoad);
  if (s.daypart) p.set("d", s.daypart);
  if (s.spendBand) p.set("sb", s.spendBand);
  if (s.regionGroup) p.set("rg", s.regionGroup);
  if (s.region) p.set("r", s.region);
  if (s.cuisine) p.set("cu", s.cuisine);
  if (s.bookingPath) p.set("bp", s.bookingPath);
  if (s.query) p.set("q", s.query);
  if (s.preferNoConflicts) p.set("nc", "1");
  if (s.preferWalkIn) p.set("wi", "1");
  if (s.wineForward) p.set("wf", "1");
  return p.toString();
}

export function decodeSituation(search: string): Situation {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const num = (k: string) => {
    const v = p.get(k);
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const occ = p.get("o");
  const cons = (p.get("c") ?? "")
    .split("|")
    .filter((x): x is Constraint => (CONSTRAINTS as readonly string[]).includes(x));

  return {
    ...emptySituation,
    occasion: (OCCASIONS as readonly string[]).includes(occ ?? "") ? (occ as Occasion) : null,
    partySize: num("p"),
    leadDays: num("l"),
    constraints: cons,
    maxCommitment: p.get("mc"),
    maxPlanningLoad: p.get("mp"),
    daypart: p.get("d"),
    spendBand: p.get("sb"),
    regionGroup: p.get("rg"),
    region: p.get("r"),
    cuisine: p.get("cu"),
    bookingPath: p.get("bp"),
    query: p.get("q") ?? "",
    preferNoConflicts: p.get("nc") === "1",
    preferWalkIn: p.get("wi") === "1",
    wineForward: p.get("wf") === "1",
  };
}
