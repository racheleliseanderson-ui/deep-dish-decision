import {
  type ConfirmItem,
  type ConfirmationPass,
  type PassStatus,
  type ReservationCapture,
  type RestaurantRecord,
  type Scored,
  type Situation,
} from "./types.ts";
import { resolvedNightDate } from "./intelligence.ts";
import { formatHumanDate, formatTimeLabel, uid } from "./utils.ts";

function isThin(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return v.length < 40 || v.includes("not stated") || v.includes("not published") || v.includes("not fully");
}

function emptyCapture(s: Situation): ReservationCapture {
  return {
    confirmationNumber: "",
    dateConfirmed: "",
    contactPerson: "",
    channel: "",
    reservationDate: resolvedNightDate(s) ?? "",
    reservationTime: s.nightTime ?? "",
    partySizeConfirmed: s.partySize,
    cancellationDeadline: "",
    depositAmount: "",
    notes: "",
  };
}

export function buildConfirmItems(r: RestaurantRecord, s: Situation, sc: Scored): ConfirmItem[] {
  const date = formatHumanDate(resolvedNightDate(s));
  const time = formatTimeLabel(s.nightTime);
  const party = s.partySize ? `${s.partySize}` : "our party";
  const items: ConfirmItem[] = [];

  const add = (item: Omit<ConfirmItem, "status" | "answer" | "askedOf">) => {
    items.push({ ...item, status: "open", answer: "", askedOf: "" });
  };

  add({
    id: "hours",
    category: "hours",
    priority: "must",
    question: `Can you confirm you are open ${date}${s.nightTime ? ` around ${time}` : " for the service we want"}, and what time the last seating is?`,
    why: "Hours move. A published Tuesday–Saturday line is not a promise for your date.",
    evidence: r.hoursSummary,
    volatility: "volatile",
  });

  add({
    id: "menu-price",
    category: "menu-price",
    priority: "must",
    question: `Is the current menu and per-guest price still what is published, including service charge, pairing, and supplements, for a party of ${party}?`,
    why: "Price and menu are volatile. Do not invite anyone on a remembered number.",
    evidence: r.priceDetails,
    volatility: "volatile",
  });

  add({
    id: "reservation",
    category: "reservation",
    priority: "must",
    question: `Can you hold a table for ${party} on ${date}${s.nightTime ? ` at ${time}` : ""} on the ${r.bookingPlatforms[0] ?? "official"} pathway — and is that the dining room, bar, patio, or a counter?`,
    why: "The room you think you booked is often not the room you get. Pathway and room have to be named.",
    evidence: r.reservationDetails,
    volatility: "volatile",
  });

  add({
    id: "cancellation",
    category: "cancellation",
    priority: "must",
    question:
      "What is the cancellation window, the fee, any deposit or card hold, and does reducing the party count as a cancellation?",
    why: "The cost of a booking includes deposit, cancellation window, card hold, and table length. Read the terms before the prices.",
    evidence: [r.cancellationPolicy, r.depositPolicy, r.latePolicy].filter(Boolean).join(" "),
    volatility: isThin(r.cancellationPolicy) ? "unknown" : "volatile",
  });

  const dietOn = s.constraints.includes("Severe allergy / celiac") || s.occasion === "Dietary-sensitive visit";
  add({
    id: "dietary",
    category: "dietary",
    priority: dietOn ? "must" : "if-relevant",
    question: dietOn
      ? "I need to name a severe allergy / celiac. Who in the kitchen can confirm cross-contact practice for that date — substitution, separate prep, or the dish removed?"
      : "If anyone in the party has a restriction, who should we speak to, and how far in advance?",
    why: "Not whether they can, but how. The difference decides the evening for the guest who has it. A booking-form note is not kitchen practice.",
    evidence: r.dietaryDetails,
    volatility: "unknown",
  });

  const accessOn = s.constraints.includes("Mobility / step-free needs") || s.occasion === "Access-sensitive visit";
  add({
    id: "access",
    category: "access",
    priority: accessOn ? "must" : "if-relevant",
    question:
      "Can you describe the exact path: kerb to door, door to table, table to restroom — including steps, elevator, and which entrance we should use?",
    why: "“Accessible” covers all three unevenly. Silence is not a step-free route.",
    evidence: r.accessibilityState,
    volatility: "unknown",
  });

  if (s.constraints.includes("Hard end time (show, train, childcare)") || (r.tableTimeMinutes ?? 0) >= 150) {
    add({
      id: "pacing",
      category: "pacing",
      priority: s.constraints.includes("Hard end time (show, train, childcare)") ? "must" : "should",
      question: r.tableTimeMinutes
        ? `The record has a table time around ${r.tableTimeMinutes} minutes. Can you confirm the actual table time in minutes for our seating, and whether a hard out-time will be accepted, not just noted?`
        : "What is the actual table time in minutes for our seating, and will you accept a hard out-time if we state it now?",
      why: "A turn time you learn on arrival has already reshaped the night. Ask for it in minutes.",
      evidence: r.typicalMealLength,
      volatility: "volatile",
    });
  }

  if ((s.partySize ?? 0) >= 6 || s.constraints.includes("Large party (6+)")) {
    add({
      id: "party",
      category: "party",
      priority: "must",
      question: `We are ${party}. What is the maximum single-table seating, is there a set menu or deposit, and when is the cut-off for a change in count?`,
      why: "Large-party terms almost never match the public two-top flow.",
      evidence: r.groupDetails,
      volatility: "unknown",
    });
  }

  if (s.constraints.includes("Private / semi-private required")) {
    add({
      id: "private",
      category: "party",
      priority: "must",
      question: "Is a private or semi-private room actually available that night, at what minimum spend, and does dining-room noise carry into it?",
      why: "Private-ready on a brochure is not a hold on your date.",
      evidence: r.groupDetails,
      volatility: "unknown",
    });
  }

  if (s.constraints.includes("Hearing / noise sensitivity")) {
    add({
      id: "noise",
      category: "environment",
      priority: "should",
      question: "Can you seat us at a perimeter or side-room table at an early seating, and how loud is that room on this night of week?",
      why: "Noise band is first-party language, not a measurement. Ask for the table.",
      evidence: r.atmosphereSummary,
      volatility: "unknown",
    });
  }

  if (s.constraints.includes("Zero-proof / no alcohol")) {
    add({
      id: "zero-proof",
      category: "beverage",
      priority: "should",
      question: "What non-alcoholic options exist beyond soft drinks, and is a zero-proof pairing running that night — at what supplement?",
      why: "A pairing table without an NA path isolates the guest who asked for it.",
      evidence: r.beverageDetails,
      volatility: "unknown",
    });
  }

  if (r.hasOfficialConflict) {
    add({
      id: "conflict",
      category: "conflict",
      priority: "must",
      question: `Two official sources disagree. Please settle this in one sentence: ${r.conflict || "the conflicted field on the record"}.`,
      why: "The call is the only tiebreak. Do not adopt the friendlier claim.",
      evidence: r.conflict,
      volatility: "unknown",
    });
  }

  if (r.latePolicy && !isThin(r.latePolicy)) {
    add({
      id: "late",
      category: "reservation",
      priority: "should",
      question: `The record says: “${r.latePolicy}” — is that still current, and how many minutes of grace do we have?`,
      why: "Late policy is how a table actually dies.",
      evidence: r.latePolicy,
      volatility: "volatile",
    });
  }

  // Carry high-impact findings that didn't already become a structured item.
  const covered = new Set(items.map((i) => i.category));
  for (const finding of sc.findings) {
    if (finding.layer === "unknown" && finding.impact < 40) continue;
    if (finding.domain === "residual") continue;
    const catMap: Record<string, ConfirmItem["category"]> = {
      access: "access",
      dietary: "dietary",
      booking: "reservation",
      party: "party",
      timing: "pacing",
      environment: "environment",
      spend: "menu-price",
      beverage: "beverage",
      evidence: "conflict",
      cancellation: "cancellation",
    };
    const cat = catMap[finding.domain];
    if (!cat || covered.has(cat)) continue;
    add({
      id: `finding-${finding.id}`,
      category: cat,
      priority: finding.layer === "critical" ? "must" : "should",
      question: finding.action,
      why: finding.title,
      evidence: finding.detail,
      volatility: finding.layer === "unknown" ? "unknown" : "volatile",
    });
    covered.add(cat);
  }

  return items;
}

export function evaluatePass(items: ConfirmItem[], capture: ReservationCapture): {
  status: PassStatus;
  holdReasons: string[];
} {
  const must = items.filter((i) => i.priority === "must");
  const denied = must.filter((i) => i.status === "denied");
  const openMust = must.filter((i) => i.status === "open" || i.status === "still-unknown");
  const holdReasons = denied.map((i) => i.question);

  if (denied.length) return { status: "hold", holdReasons };
  if (openMust.length) return { status: "in-progress", holdReasons: [] };

  const booked =
    Boolean(capture.confirmationNumber.trim()) &&
    Boolean(capture.dateConfirmed.trim()) &&
    Boolean(capture.contactPerson.trim() || capture.channel);
  if (booked) return { status: "verified", holdReasons: [] };
  return { status: "in-progress", holdReasons: [] };
}

export function createPass(
  r: RestaurantRecord,
  s: Situation,
  sc: Scored,
  nightId: string,
): ConfirmationPass {
  const items = buildConfirmItems(r, s, sc);
  const capture = emptyCapture(s);
  const { status, holdReasons } = evaluatePass(items, capture);
  const now = new Date().toISOString();
  return {
    id: uid("pass"),
    slug: r.slug,
    restaurantTitle: r.title,
    nightId,
    createdAt: now,
    updatedAt: now,
    situation: s,
    items,
    capture,
    status,
    holdReasons,
  };
}

export function applyItem(
  pass: ConfirmationPass,
  itemId: string,
  patch: Partial<Pick<ConfirmItem, "status" | "answer" | "askedOf">>,
): ConfirmationPass {
  const items = pass.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
  const { status, holdReasons } = evaluatePass(items, pass.capture);
  return { ...pass, items, status, holdReasons, updatedAt: new Date().toISOString() };
}

export function applyCapture(
  pass: ConfirmationPass,
  patch: Partial<ReservationCapture>,
): ConfirmationPass {
  const capture = { ...pass.capture, ...patch };
  const { status, holdReasons } = evaluatePass(pass.items, capture);
  return { ...pass, capture, status, holdReasons, updatedAt: new Date().toISOString() };
}

export function mustOpenCount(pass: ConfirmationPass): number {
  return pass.items.filter((i) => i.priority === "must" && (i.status === "open" || i.status === "still-unknown"))
    .length;
}

export function passProgress(pass: ConfirmationPass): { done: number; total: number } {
  const must = pass.items.filter((i) => i.priority === "must");
  const done = must.filter((i) => i.status === "confirmed" || i.status === "not-applicable").length;
  return { done, total: must.length };
}

export const CHANNEL_LABELS: Record<ReservationCapture["channel"], string> = {
  "": "Not stated",
  phone: "Phone",
  opentable: "OpenTable",
  resy: "Resy",
  tock: "Tock",
  direct: "Direct site",
  email: "Email",
  "walk-in": "Walk-in hold",
};

export function callScript(pass: ConfirmationPass, record: RestaurantRecord): string {
  const must = pass.items.filter((i) => i.priority === "must");
  const rest = pass.items.filter((i) => i.priority !== "must");
  const lines = [
    `Call ${record.title} at ${record.phone || "the number on the official page"}.`,
    `Night: ${formatHumanDate(pass.capture.reservationDate || pass.situation.nightDate)} · party ${pass.situation.partySize ?? "unspecified"}.`,
    pass.situation.constraints.length ? `Constraints: ${pass.situation.constraints.join("; ")}.` : "",
    "",
    "Must-ask, in this order:",
    ...must.map((i, n) => `${n + 1}. ${i.question}`),
  ];
  if (rest.length) {
    lines.push("", "If relevant:");
    rest.forEach((i) => lines.push(`- ${i.question}`));
  }
  lines.push("", "Then write down: confirmation number, who answered, date confirmed, cancellation deadline.");
  return lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

/** Reader-facing wording for a pass status. The stored values stay as they are. */
const STATUS_TEXT: Record<PassStatus, string> = {
  "in-progress": "In progress — not everything is answered yet",
  hold: "On hold — the restaurant said no to a must-ask question",
  verified: "Verified — every must-ask answered and the reservation recorded",
  abandoned: "Set aside",
};

export function packetPlaintext(pass: ConfirmationPass, record: RestaurantRecord): string {
  const confirmed = pass.items.filter((i) => i.status === "confirmed" || i.status === "not-applicable");
  const denied = pass.items.filter((i) => i.status === "denied");
  const open = pass.items.filter((i) => i.status === "open" || i.status === "still-unknown");
  const lines = [
    `Deep Dish — Confirmation & reservation record`,
    record.title,
    `${record.address} · ${record.phone}`,
    `Status: ${STATUS_TEXT[pass.status]}`,
    "",
    "The night",
    `Occasion: ${pass.situation.occasion ?? "not stated"}`,
    `Party: ${pass.capture.partySizeConfirmed ?? pass.situation.partySize ?? "not stated"}`,
    `Date: ${formatHumanDate(pass.capture.reservationDate || pass.situation.nightDate)}`,
    `Time: ${pass.capture.reservationTime || pass.situation.nightTime || "not stated"}`,
    `Constraints: ${pass.situation.constraints.join("; ") || "none stated"}`,
    "",
    "Reservation",
    `Confirmation number: ${pass.capture.confirmationNumber || "not recorded"}`,
    `Date confirmed: ${formatHumanDate(pass.capture.dateConfirmed) || "not recorded"}`,
    `Contact: ${pass.capture.contactPerson || "not recorded"}`,
    `Channel: ${CHANNEL_LABELS[pass.capture.channel]}`,
    `Cancellation deadline: ${pass.capture.cancellationDeadline || "not recorded"}`,
    `Deposit / hold: ${pass.capture.depositAmount || "not recorded"}`,
  ];
  if (pass.capture.notes) lines.push(`Notes: ${pass.capture.notes}`);
  if (denied.length) {
    lines.push("", "The restaurant said no — booking on hold");
    denied.forEach((i) => lines.push(`- ${i.question} ${i.answer ? `— ${i.answer}` : ""}`));
  }
  if (confirmed.length) {
    lines.push("", "What the restaurant confirmed");
    confirmed.forEach((i) => {
      lines.push(`- ${i.question}`);
      if (i.answer) lines.push(`  ${i.answer}${i.askedOf ? ` (${i.askedOf})` : ""}`);
    });
  }
  if (open.length) {
    lines.push("", "Still open");
    open.forEach((i) => lines.push(`- ${i.priority === "must" ? "Must-ask. " : ""}${i.question}`));
  }
  lines.push("", record.disclaimer);
  return lines.join("\n");
}
