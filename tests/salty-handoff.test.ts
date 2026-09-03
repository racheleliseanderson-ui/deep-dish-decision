/**
 * Salty Handoff v2 — contract tests.
 *
 * These run in every app that vendors the contract:
 *   node --experimental-strip-types --test tests/salty-handoff.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HANDOFF_HASH_KEY,
  HANDOFF_VERSION,
  MAX_PACKET_BYTES,
  type SaltyHandoff,
} from "../src/lib/salty-handoff/contract.ts";
import {
  createHandoff,
  decodeHandoff,
  describeHandoff,
  encodeBase64Url,
  encodeHandoff,
  findProhibitedField,
  handoffUrl,
  readHandoffToken,
  summarizeHandoff,
  validateHandoff,
} from "../src/lib/salty-handoff/codec.ts";
import {
  applyImport,
  beginImport,
  dismissImport,
  shouldApply,
} from "../src/lib/salty-handoff/import-session.ts";
import {
  outgoingRestaurantToOccasion,
  planningDietBanner,
  situationFromHandoff,
  situationIsStarted,
  unresolvedCategories,
  unresolvedCategory,
} from "../src/lib/salty-handoff/apply.ts";
import type { Situation } from "../src/lib/intelligence.ts";

const NOW = Date.parse("2026-08-28T18:00:00.000Z");

function fullPacket(): SaltyHandoff {
  return {
    v: 2,
    from: "desk",
    to: "occasion",
    at: "2026-08-28T17:00:00.000Z",
    intent: "host",
    party: { size: 6, seatsKnown: true },
    timing: { date: "2026-08-29", time: "19:00", window: "days" },
    constraint: "service load",
    occasion: {
      type: "Birthday dinner",
      serviceStyle: "seated",
      diet: ["vegetarian"],
      region: "Denver metro",
    },
  };
}

/* ── valid packets ─────────────────────────────────────────────────────────── */

test("valid packet round-trips through encode and decode", () => {
  const packet = fullPacket();
  const result = decodeHandoff(encodeHandoff(packet), "occasion", NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.handoff, packet);
  assert.equal(result.stale, false);
  assert.deepEqual(result.dropped, []);
});

test("every destination-specific block survives a round trip", () => {
  const kitchen = createHandoff("kitchen", "occasion", "host", {
    availability: {
      items: [{ name: "Anchovies", qty: "1 tin", urgency: "low" }, { name: "Lemons" }],
      summary: "18 confirmed items",
    },
  });
  const kOut = decodeHandoff(encodeHandoff(kitchen), "occasion", NOW);
  assert.equal(kOut.ok, true);
  if (kOut.ok) assert.equal(kOut.handoff.availability?.items.length, 2);

  const menu = createHandoff("occasion", "restaurant", "host", {
    menu: {
      roles: [{ role: "anchor", dish: "Short rib" }, { role: "relief", dish: "Chicory salad" }],
      anchor: "Short rib",
      stress: { band: "workable", weak: ["serviceFit"] },
    },
  });
  const mOut = decodeHandoff(encodeHandoff(menu), "restaurant", NOW);
  assert.equal(mOut.ok, true);
  if (mOut.ok) assert.equal(mOut.handoff.menu?.stress?.band, "workable");

  const back = createHandoff("restaurant", "desk", "return-decision", {
    decision: { room: "Tavernetta", status: "hold", unresolved: ["Step-free entry unconfirmed"] },
  });
  const bOut = decodeHandoff(encodeHandoff(back), "desk", NOW);
  assert.equal(bOut.ok, true);
  if (bOut.ok) assert.equal(bOut.handoff.decision?.unresolved?.length, 1);
});

/* ── missing optional fields ───────────────────────────────────────────────── */

test("a minimal packet with no optional fields is valid", () => {
  const minimal = {
    v: 2,
    from: "desk",
    to: "kitchen",
    at: "2026-08-28T17:00:00.000Z",
    intent: "cook-from-pantry",
  };
  const result = validateHandoff(minimal, "kitchen", NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.handoff.party, undefined);
  assert.equal(result.handoff.timing, undefined);
  assert.equal(result.handoff.constraint, undefined);
  assert.doesNotThrow(() => describeHandoff(result.handoff));
  assert.equal(summarizeHandoff(result.handoff).length, 1);
});

test("partially-filled optional blocks keep what is valid and drop what is not", () => {
  const packet = {
    ...fullPacket(),
    party: { size: "six", seatsKnown: "yes" },
    timing: { date: "29-08-2026", time: "25:99", window: "someday" },
  };
  const result = validateHandoff(packet, "occasion", NOW);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.handoff.party, undefined, "junk party is dropped, not coerced");
  assert.equal(result.handoff.timing, undefined, "junk timing is dropped, not coerced");
  assert.equal(result.handoff.occasion?.type, "Birthday dinner", "valid siblings survive");
});

/* ── invalid versions ──────────────────────────────────────────────────────── */

test("an unsupported version fails closed with a friendly message", () => {
  for (const v of [1, 3, 99, "2", null, undefined]) {
    const result = validateHandoff({ ...fullPacket(), v }, "occasion", NOW);
    assert.equal(result.ok, false, `version ${String(v)} must not validate`);
    if (result.ok) continue;
    assert.equal(result.reason, "unsupported-version");
    assert.match(result.message, /newer version/i);
  }
});

/* ── invalid destination ───────────────────────────────────────────────────── */

test("a packet addressed elsewhere is refused", () => {
  const result = decodeHandoff(encodeHandoff(fullPacket()), "restaurant", NOW);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "wrong-destination");
});

test("an unknown app name in from or to is malformed", () => {
  assert.equal(validateHandoff({ ...fullPacket(), to: "bakery" }, undefined, NOW).ok, false);
  assert.equal(validateHandoff({ ...fullPacket(), from: "" }, undefined, NOW).ok, false);
});

test("a packet addressed to its own sender is refused", () => {
  const result = validateHandoff({ ...fullPacket(), from: "occasion" }, "occasion", NOW);
  assert.equal(result.ok, false);
});

/* ── corrupted encoding and oversize ───────────────────────────────────────── */

test("corrupted encoding never throws and never validates", () => {
  const bad = [
    "not-base64!!!",
    encodeBase64Url("{ this is not json"),
    encodeBase64Url("[1,2,3]"),
    encodeBase64Url("null"),
    encodeBase64Url('"a string"'),
    encodeHandoff(fullPacket()).slice(0, 12),
    "%%%%",
    " ",
  ];
  for (const token of bad) {
    const result = decodeHandoff(token, "occasion", NOW);
    assert.equal(result.ok, false, `${token} must not validate`);
    if (!result.ok) assert.ok(result.message.length > 0);
  }
});

test("an oversized packet is refused before it is trusted", () => {
  const huge = createHandoff("desk", "occasion", "host", {
    occasion: { type: "x".repeat(MAX_PACKET_BYTES * 3) },
  });
  const result = decodeHandoff(encodeHandoff(huge), "occasion", NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "too-large");
});

/* ── prohibited fields ─────────────────────────────────────────────────────── */

test("prohibited fields reject the whole packet at any depth", () => {
  const cases: Record<string, unknown>[] = [
    { ...fullPacket(), guestNames: ["Claire", "Hunter"] },
    { ...fullPacket(), guest_names: ["Claire"] },
    { ...fullPacket(), "guest-names": ["Claire"] },
    { ...fullPacket(), notes: "she hates cilantro" },
    { ...fullPacket(), occasion: { type: "Dinner", allergens: ["peanut"] } },
    { ...fullPacket(), availability: { items: [{ name: "Gin", detections: [1, 2] }] } },
    { ...fullPacket(), menu: { roles: [{ role: "anchor", dish: "Rib", rejected: ["Duck"] }] } },
    { ...fullPacket(), decision: { room: "X", shortlist: ["Y", "Z"] } },
    { ...fullPacket(), shoppingList: ["butter"] },
    { ...fullPacket(), prepSchedule: [{ at: "14:00" }] },
    { ...fullPacket(), email: "someone@example.com" },
    { ...fullPacket(), coordinates: { lat: 1, lng: 2 } },
  ];
  for (const value of cases) {
    const result = validateHandoff(value, "occasion", NOW);
    assert.equal(result.ok, false, `${JSON.stringify(value).slice(0, 60)} must be refused`);
    if (!result.ok) assert.equal(result.reason, "prohibited-field");
  }
});

test("the prohibited scan finds nested keys and ignores non-objects", () => {
  assert.equal(findProhibitedField({ a: { b: { c: { guestNames: [] } } } }), "guestNames");
  assert.equal(findProhibitedField({ a: [{ b: [{ allergy: true }] }] }), "allergy");
  assert.equal(findProhibitedField(fullPacket()), null);
  assert.equal(findProhibitedField(null), null);
  assert.equal(findProhibitedField("string"), null);
});

test("no field the contract actually uses is on the prohibited list", () => {
  const packet = createHandoff("kitchen", "occasion", "host", {
    party: { size: 6, seatsKnown: true },
    timing: { date: "2026-08-29", time: "19:00", window: "days" },
    constraint: "oven contention",
    availability: { items: [{ name: "Gin", qty: "1 bottle", urgency: "none" }], summary: "ok" },
    menu: {
      roles: [{ role: "anchor", dish: "Rib" }],
      anchor: "Rib",
      stress: { band: "strong", weak: [] },
    },
    occasion: { type: "Dinner", serviceStyle: "seated", diet: ["vegan"], region: "Denver metro" },
    decision: { room: "Tavernetta", status: "verified", unresolved: [] },
  });
  assert.equal(findProhibitedField(packet), null);
});

/* ── unknown fields are tolerated ──────────────────────────────────────────── */

test("unknown fields from a future build are dropped, not fatal", () => {
  const result = validateHandoff(
    { ...fullPacket(), mood: "celebratory", weatherPlan: { outdoor: true } },
    "occasion",
    NOW,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.dropped.sort(), ["mood", "weatherPlan"]);
  assert.equal("mood" in result.handoff, false);
});

/* ── normal direct visit, no packet ────────────────────────────────────────── */

test("a direct visit with no packet is idle, not an error", () => {
  assert.equal(readHandoffToken(""), "");
  assert.equal(readHandoffToken("#"), "");
  assert.equal(readHandoffToken("#section-two"), "");
  assert.equal(readHandoffToken("#vo=legacy"), "");

  const result = decodeHandoff("", "occasion", NOW);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "absent");
    assert.equal(result.message, "", "an absent packet says nothing to the user");
  }
  assert.equal(beginImport(result, false).phase, "idle");
});

test("the fragment key is read out of a compound hash", () => {
  const token = encodeHandoff(fullPacket());
  assert.equal(readHandoffToken(`#${HANDOFF_HASH_KEY}=${token}`), token);
  assert.equal(readHandoffToken(`#a=1&${HANDOFF_HASH_KEY}=${token}`), token);
  assert.equal(readHandoffToken(`#${HANDOFF_HASH_KEY}=${token}&b=2`), token);
});

/* ── staleness ─────────────────────────────────────────────────────────────── */

test("a packet older than a week is valid but flagged stale", () => {
  const old = { ...fullPacket(), at: "2026-08-01T12:00:00.000Z" };
  const result = validateHandoff(old, "occasion", NOW);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.stale, true);
});

/* ── an import never silently overwrites existing work ─────────────────────── */

test("a valid packet is offered, never auto-applied", () => {
  const decoded = decodeHandoff(encodeHandoff(fullPacket()), "occasion", NOW);
  const session = beginImport(decoded, false);
  assert.equal(session.phase, "offered");
  assert.equal(shouldApply(session), false, "an offer must not be writable yet");
});

test("an import over existing work is flagged before the user chooses", () => {
  const decoded = decodeHandoff(encodeHandoff(fullPacket()), "occasion", NOW);
  const session = beginImport(decoded, true);
  assert.equal(session.phase, "offered");
  assert.equal(session.overwrites, true);
  assert.equal(shouldApply(session), false);

  const applied = applyImport(session);
  assert.equal(shouldApply(applied), true, "explicit apply is the only way in");
  assert.deepEqual(applied.handoff, fullPacket());
});

test("ignoring an offer discards it and writes nothing", () => {
  const decoded = decodeHandoff(encodeHandoff(fullPacket()), "occasion", NOW);
  const dismissed = dismissImport(beginImport(decoded, true));
  assert.equal(dismissed.phase, "dismissed");
  assert.equal(dismissed.handoff, null);
  assert.equal(shouldApply(dismissed), false);
});

test("apply is unreachable from a failed or idle session", () => {
  const failed = beginImport(decodeHandoff("garbage!!", "occasion", NOW), false);
  assert.equal(failed.phase, "failed");
  assert.equal(shouldApply(applyImport(failed)), false);
  assert.equal(shouldApply(applyImport({ ...failed, phase: "idle" })), false);
});

/* ── user-facing language stays plain ──────────────────────────────────────── */

test("the summary line reads like a sentence, not a record", () => {
  const line = describeHandoff(fullPacket());
  assert.equal(
    line,
    "From Salty & Clever: hosting at home · 6 guests · Saturday at 19:00 · Birthday dinner · Denver metro · service load is the main constraint.",
  );
  assert.doesNotMatch(line, /payload|schema|packet|contract|localStorage|hydrat|serial/i);
});

test("no failure message leaks implementation vocabulary", () => {
  const tokens = ["garbage!!", encodeBase64Url(JSON.stringify({ ...fullPacket(), v: 7 }))];
  for (const token of tokens) {
    const result = decodeHandoff(token, "occasion", NOW);
    if (!result.ok && result.message) {
      assert.doesNotMatch(
        result.message,
        /payload|schema|base64|serial|hydrat|localStorage|packet/i,
      );
    }
  }
});

/* ── URL construction ──────────────────────────────────────────────────────── */

test("handoffUrl targets the destination origin and uses a fragment", () => {
  const url = handoffUrl(fullPacket(), "/");
  assert.ok(url.startsWith("https://occasion.saltnotes.blog/#sh="));
  assert.equal(url.includes("?"), false, "nothing sensitive may ride in a query string");
  const token = url.split("#sh=")[1] ?? "";
  const back = decodeHandoff(token, "occasion", NOW);
  assert.equal(back.ok, true);
});

test("the encoded token is url-safe", () => {
  const token = encodeHandoff(fullPacket());
  assert.doesNotMatch(token, /[+/=]/);
  assert.equal(encodeURIComponent(token), token);
});

test("the version constant matches the wire value", () => {
  assert.equal(HANDOFF_VERSION, 2);
  assert.equal(fullPacket().v, HANDOFF_VERSION);
});

/* ── restaurant apply ──────────────────────────────────────────────────────── */

function blankSituation(): Situation {
  return {
    occasion: null,
    partySize: null,
    leadDays: null,
    constraints: [],
    maxCommitment: null,
    maxPlanningLoad: null,
    daypart: null,
    spendBand: null,
    regionGroup: null,
    region: null,
    cuisine: null,
    bookingPath: null,
    query: "",
    preferNoConflicts: false,
    preferWalkIn: false,
    wineForward: false,
  };
}

test("occasion context prefills party, occasion, and lead time", () => {
  const incoming = createHandoff("occasion", "restaurant", "dine-out", {
    party: { size: 8 },
    timing: { window: "days", time: "19:00" },
    occasion: { type: "Birthday dinner", diet: ["gluten"], region: "Denver metro" },
    constraint: "service load",
  });
  const next = situationFromHandoff(incoming, blankSituation());
  assert.equal(next.partySize, 8);
  assert.equal(next.occasion, "Celebration");
  assert.equal(next.leadDays, 3);
  assert.equal(next.daypart, "Dinner language");
  assert.ok(next.constraints.includes("Large party (6+)"));
  assert.equal(next.constraints.includes("Severe allergy / celiac"), false);
  assert.equal(next.region, "Denver metro");
});

test("planning diet never chips the allergy constraint", () => {
  const incoming = createHandoff("occasion", "restaurant", "dine-out", {
    occasion: { diet: ["gluten", "celiac", "nut"] },
  });
  const next = situationFromHandoff(incoming, blankSituation());
  assert.equal(next.constraints.includes("Severe allergy / celiac"), false);
  assert.equal(next.constraints.length, 0);
  assert.equal(next.occasion, "Dietary-sensitive visit");
  const banner = planningDietBanner(incoming);
  assert.match(banner ?? "", /planning filters/i);
  assert.match(banner ?? "", /never an allergy guarantee/i);
});

test("return packet carries the chosen room, not a shortlist", () => {
  const { url, handoff } = outgoingRestaurantToOccasion({
    room: "Tavernetta",
    status: "hold",
    unresolved: [{ domain: "access", title: "Access route not stated on any source" }],
  });
  assert.equal(handoff.from, "restaurant");
  assert.equal(handoff.to, "occasion");
  assert.equal(handoff.intent, "return-decision");
  assert.equal(handoff.decision?.room, "Tavernetta");
  assert.equal(handoff.decision?.status, "hold");
  assert.deepEqual(handoff.decision?.unresolved, ["accessibility"]);
  const raw = JSON.stringify(handoff);
  assert.equal(raw.includes("shortlist"), false);
  assert.match(url, /^https:\/\/occasion\.saltnotes\.blog\/#sh=/);
  assert.equal(url.includes("?"), false);
});

test("only a category crosses the boundary, never the call script", () => {
  const allergy =
    "Hi \u2014 we\u2019re considering Tavernetta tonight for 4. One guest has a severe allergy or " +
    "celiac disease. Can the kitchen currently accommodate that safely, including cross-contact?";
  const { url, handoff } = outgoingRestaurantToOccasion({
    room: "Tavernetta",
    status: "hold",
    unresolved: [
      { domain: "dietary", title: "Dietary handling requires direct confirmation", action: allergy },
      { domain: "spend", title: "No per-guest figure on file" },
      { domain: "timing", title: "Service runs long against your hard end time" },
    ],
  });

  // The codec's PROHIBITED_FIELDS check inspects keys only, so the encoded
  // packet and the URL fragment are where a value-level leak would show up.
  const raw = JSON.stringify(handoff);
  for (const term of ["allerg", "celiac", "coeliac", "epipen", "medical", "kitchen"]) {
    assert.equal(raw.toLowerCase().includes(term), false, `leaked "${term}" in the packet`);
  }
  assert.equal(decodeURIComponent(url).toLowerCase().includes("allerg"), false);

  assert.deepEqual(handoff.decision?.unresolved, [
    "dietary cross-contact",
    "spend and deposit terms",
    "hard end time",
  ]);

  // And a decoded round trip carries the same labels.
  const token = readHandoffToken(url.slice(url.indexOf("#")));
  const decoded = decodeHandoff(token, "occasion");
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.ok && decoded.handoff.decision?.unresolved, [
    "dietary cross-contact",
    "spend and deposit terms",
    "hard end time",
  ]);
});

test("a caller holding only a sentence still emits a label, never the sentence", () => {
  // Free text in, closed vocabulary out. Nothing unrecognised is passed through.
  assert.deepEqual(unresolvedCategories(["No EpiPen policy stated"]), ["dietary cross-contact"]);
  assert.deepEqual(unresolvedCategories(["Private room minimum spend unconfirmed"]), [
    "deposit terms",
  ]);
  assert.equal(unresolvedCategory("Whether the chef is in a good mood"), "open question");
  assert.equal(unresolvedCategory(""), "open question");
  // Two findings in the same domain collapse to one label rather than repeating.
  assert.deepEqual(
    unresolvedCategories([{ domain: "hours" }, { domain: "hours" }, { domain: "access" }]),
    ["hours", "accessibility"],
  );
});

test("an incoming packet is offered, never auto-applied over an open situation", () => {
  assert.equal(situationIsStarted(blankSituation()), false);
  assert.equal(situationIsStarted({ ...blankSituation(), partySize: 4 }), true);
  const offered = beginImport({ ok: true, handoff: fullPacket() }, true);
  assert.equal(offered.phase, "offered");
  assert.equal(offered.overwrites, true);
  assert.equal(shouldApply(offered), false);
});
