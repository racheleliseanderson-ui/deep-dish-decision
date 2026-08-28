import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bySlug, restaurants } from "../data/restaurants.ts";
import { applyPlaybook, PLAYBOOKS } from "./playbooks.ts";
import {
  buildFindings,
  decisionBrief,
  emptySituation,
  rank,
  scoreRecord,
  sensitivity,
  situationDepth,
} from "./intelligence.ts";
import { buildConfirmItems, callScript, createPass, evaluatePass } from "./confirm.ts";

const denverDate = applyPlaybook(PLAYBOOKS.find((p) => p.id === "date-night")!);
const hop = bySlug.get("hop-alley")!;
const frasca = bySlug.get("frasca")!;
const cart = bySlug.get("cart-driver")!;
const tavernetta = bySlug.get("tavernetta")!;

describe("ranking — ordinary case", () => {
  it("ranks Denver date night without blocking the lead", () => {
    const ranked = rank(restaurants.filter((r) => r.regionGroup === "Denver metro"), denverDate);
    assert.ok(ranked.length > 5);
    assert.equal(ranked[0]!.blocked, false);
    assert.ok(ranked[0]!.fit >= 40);
    assert.ok(ranked.every((s, i) => i === 0 || s.rank === ranked[i - 1]!.rank + 1));
  });
});

describe("ranking — boundary large party", () => {
  it("demotes small-table rooms for a party of 6", () => {
    const s = { ...denverDate, partySize: 6, constraints: ["Large party (6+)" as const] };
    const small = scoreRecord(frasca, s);
    const group = scoreRecord(bySlug.get("safta")!, s);
    assert.ok(small.blocked || small.fit < group.fit);
    assert.ok(small.findings.some((f) => f.id === "party"));
  });
});

describe("ranking — missing data", () => {
  it("does not invent an occasion; thin situation stays provisional", () => {
    const sc = scoreRecord(tavernetta, emptySituation);
    const brief = decisionBrief(sc, emptySituation);
    assert.equal(situationDepth(emptySituation), 0);
    assert.match(brief.verdict, /thin|No blocking/i);
    assert.ok(sc.unknowns.length >= 1);
  });
});

describe("ranking — high-risk fail closed", () => {
  it("holds hop alley on celiac with short lead against 14-day notice", () => {
    const s = {
      ...denverDate,
      leadDays: 7,
      constraints: ["Severe allergy / celiac" as const],
    };
    const sc = scoreRecord(hop, s);
    assert.equal(sc.blocked, true);
    assert.ok(sc.criticals.some((f) => f.domain === "dietary"));
  });

  it("holds cart-driver on mobility because stairs/uneven terrain are stated", () => {
    const s = { ...denverDate, constraints: ["Mobility / step-free needs" as const] };
    const sc = scoreRecord(cart, s);
    assert.equal(sc.blocked, true);
    assert.ok(sc.criticals.some((f) => f.id === "access-stairs"));
  });
});

describe("ranking — known fail walk-in vs scarce", () => {
  it("blocks immersive rooms when walk-in is required", () => {
    const s = { ...denverDate, preferWalkIn: true };
    const sc = scoreRecord(frasca, s);
    assert.equal(sc.blocked, true);
    assert.ok(sc.criticals.some((f) => f.id === "walkin"));
  });

  it("does not block a stated walk-in room", () => {
    const s = { ...denverDate, preferWalkIn: true };
    const sc = scoreRecord(tavernetta, s);
    assert.equal(sc.blocked, false);
  });
});

describe("irrelevant variables", () => {
  it("does not change fit when query is empty vs whitespace", () => {
    const a = scoreRecord(tavernetta, { ...denverDate, query: "" });
    const b = scoreRecord(tavernetta, { ...denverDate, query: "   " });
    assert.equal(a.fit, b.fit);
  });
});

describe("sensitivity", () => {
  it("celiac trial moves fit or blocks hop alley", () => {
    const rows = sensitivity(denverDate, "hop-alley");
    const celiac = rows.find((r) => /celiac/i.test(r.label));
    assert.ok(celiac);
    assert.ok(celiac!.blocked || celiac!.delta !== 0);
  });
});

describe("confirmation pass", () => {
  it("always asks hours, price, reservation, cancellation", () => {
    const sc = scoreRecord(tavernetta, denverDate);
    const items = buildConfirmItems(tavernetta, denverDate, sc);
    const ids = items.map((i) => i.id);
    assert.ok(ids.includes("hours"));
    assert.ok(ids.includes("menu-price"));
    assert.ok(ids.includes("reservation"));
    assert.ok(ids.includes("cancellation"));
  });

  it("promotes dietary to must when celiac is stated", () => {
    const s = { ...denverDate, constraints: ["Severe allergy / celiac" as const] };
    const sc = scoreRecord(hop, s);
    const items = buildConfirmItems(hop, s, sc);
    assert.equal(items.find((i) => i.id === "dietary")?.priority, "must");
  });

  it("is not verified until must items and confirmation number exist", () => {
    const sc = scoreRecord(tavernetta, denverDate);
    const pass = createPass(tavernetta, denverDate, sc, "night_test");
    assert.notEqual(pass.status, "verified");
    const mustConfirmed = pass.items.map((i) =>
      i.priority === "must" ? { ...i, status: "confirmed" as const } : i,
    );
    const mid = evaluatePass(mustConfirmed, pass.capture);
    assert.equal(mid.status, "in-progress");
    const booked = evaluatePass(mustConfirmed, {
      ...pass.capture,
      confirmationNumber: "OT-1",
      dateConfirmed: "2026-08-27",
      contactPerson: "Maya",
      channel: "phone",
    });
    assert.equal(booked.status, "verified");
  });

  it("holds the packet when a must item is denied", () => {
    const sc = scoreRecord(tavernetta, denverDate);
    const pass = createPass(tavernetta, denverDate, sc, "night_test");
    const items = pass.items.map((i) =>
      i.priority === "must" ? { ...i, status: i.id === "hours" ? ("denied" as const) : ("confirmed" as const) } : i,
    );
    const ev = evaluatePass(items, {
      ...pass.capture,
      confirmationNumber: "x",
      dateConfirmed: "2026-08-27",
      channel: "phone",
    });
    assert.equal(ev.status, "hold");
  });

  it("writes a call script with the restaurant phone and must-asks", () => {
    const sc = scoreRecord(tavernetta, denverDate);
    const pass = createPass(tavernetta, denverDate, sc, "night_test");
    const script = callScript(pass, tavernetta);
    assert.match(script, /Tavernetta/);
    assert.match(script, /720-605-1889/);
    assert.match(script, /Must-ask/);
  });
});

describe("findings — impossible input", () => {
  it("does not throw on contradictory constraints", () => {
    const s = {
      ...denverDate,
      preferWalkIn: true,
      constraints: ["Severe allergy / celiac" as const, "Private / semi-private required" as const],
      partySize: 12,
    };
    assert.doesNotThrow(() => {
      const findings = buildFindings(frasca, s);
      assert.ok(findings.length >= 1);
    });
  });
});

describe("playbook date", () => {
  it("fills nightDate from leadDays so the date field is not empty", () => {
    assert.ok(denverDate.nightDate);
    assert.match(denverDate.nightDate!, /^\d{4}-\d{2}-\d{2}$/);
  });
});
