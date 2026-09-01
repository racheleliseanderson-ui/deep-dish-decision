import { describe, expect, it } from "vitest";
import { records } from "@/lib/dataset";
import {
  emptySituation,
  filterRecords,
  rank,
  scoreRecord,
  type Situation,
} from "@/lib/intelligence";
import {
  haversineMi,
  loadLiveGroup,
  openStateAt,
  minutesToClock,
  servesAt,
  spendLine,
  partyTotal,
  type LiveRow,
} from "@/lib/live";

const washington = records.filter((r) => r.regionGroup === "Washington");

async function live() {
  return loadLiveGroup("Washington");
}

describe("live layer", () => {
  it("holds a coordinate for every record in a region", async () => {
    const rows = await live();
    const missing = washington.filter((r) => !rows[r.slug]?.ll);
    expect(missing.map((r) => r.slug)).toEqual([]);
  });

  it("labels city centroids as estimates rather than exact points", async () => {
    const rows = await live();
    for (const row of Object.values(rows)) {
      if (row.ll) expect(["exact", "city"]).toContain(row.llSource);
    }
  });

  it("measures a known distance correctly", () => {
    // Seattle downtown → Portland downtown is ~145 miles.
    const mi = haversineMi([47.6062, -122.3321], [45.5152, -122.6784]);
    expect(mi).toBeGreaterThan(130);
    expect(mi).toBeLessThan(160);
  });
});

describe("opening hours", () => {
  const row: LiveRow = {
    tz: "America/Los_Angeles",
    // Sunday-first. Tuesday 17:00–22:00, Friday 17:00–02:00 (crosses midnight).
    hours: [[], [], [[1020, 1320]], [], [], [[1020, 120]], []],
  };

  const at = (iso: string) => new Date(iso);

  it("reads open during service", () => {
    // Tuesday 19:00 Pacific
    const s = openStateAt(row, at("2026-09-01T19:00:00-07:00"));
    expect(s.state).toBe("open");
  });

  it("warns when closing within the hour", () => {
    const s = openStateAt(row, at("2026-09-01T21:30:00-07:00"));
    expect(s.state).toBe("closing-soon");
  });

  it("reads not-yet-open before service", () => {
    const s = openStateAt(row, at("2026-09-01T15:00:00-07:00"));
    expect(s.state).toBe("opens-later");
  });

  it("reads closed on a dark day", () => {
    // Monday
    const s = openStateAt(row, at("2026-08-31T19:00:00-07:00"));
    expect(s.state).toBe("closed-today");
  });

  it("carries a service that crosses midnight into the next day", () => {
    // Saturday 00:30 — still inside Friday's 17:00–02:00 service.
    expect(servesAt(row, 6, 30)).toBe(true);
    // Saturday 03:00 — after it ends, and Saturday itself is dark.
    expect(servesAt(row, 6, 180)).toBe(false);
  });

  it("formats clock times the way a person reads them", () => {
    expect(minutesToClock(1020)).toBe("5pm");
    expect(minutesToClock(1290)).toBe("9:30pm");
    expect(minutesToClock(0)).toBe("12am");
    expect(minutesToClock(720)).toBe("12pm");
  });
});

describe("spend", () => {
  it("reports a published per-guest figure as published", () => {
    const line = spendLine({ pp: [222, 222], ppSource: "published", ppService: 20 });
    expect(line?.text).toContain("$222");
    expect(line?.source).toMatch(/Published/);
  });

  it("marks a band-derived range as an estimate", () => {
    const line = spendLine({ pp: [50, 90], ppSource: "band" });
    expect(line?.source).toMatch(/Estimated/);
  });

  it("scales a party total", () => {
    expect(partyTotal({ pp: [50, 90], ppSource: "band" }, 4)).toBe("~$200–$350 for 4");
  });
});

describe("ranking discriminates", () => {
  it("spreads fit across a wide range rather than clustering", async () => {
    const rows = await live();
    const s: Situation = { ...emptySituation, occasion: "Date night", partySize: 2, leadDays: 5 };
    const scored = rank(washington, s, { live: rows, now: new Date("2026-09-04T19:00:00-07:00") });
    const fits = scored.map((x) => x.fit);
    const spread = Math.max(...fits) - Math.min(...fits);
    expect(spread).toBeGreaterThan(25);
  });

  it("puts a nearby room above an identical distant one", async () => {
    const rows = await live();
    const s: Situation = {
      ...emptySituation,
      occasion: "Date night",
      origin: [47.6062, -122.3321], // downtown Seattle
      originLabel: "Seattle",
    };
    const scored = rank(washington, s, { live: rows, now: new Date("2026-09-04T19:00:00-07:00") });
    const top = scored.filter((x) => !x.blocked).slice(0, 10);
    const withDistance = top.filter((x) => x.distanceMi !== null);
    expect(withDistance.length).toBeGreaterThan(0);
    // The leader should be closer than the median of the region.
    const all = scored
      .map((x) => x.distanceMi)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)] ?? 0;
    expect(withDistance[0]!.distanceMi!).toBeLessThanOrEqual(median);
  });
});

describe("the reader's arrival time, not the wall clock", () => {
  const row: LiveRow = {
    tz: "America/Los_Angeles",
    // Thursday 17:00-22:00 only.
    hours: [[], [], [], [], [[1020, 1320]], [], []],
  };
  const rows = { probe: row };
  const rec = { ...washington[0]!, slug: "probe" };

  it("scores the moment you chose, not the moment you asked", () => {
    // Wednesday 22:00 local, arriving 19:00 — which rolls to Thursday.
    const now = new Date("2026-09-02T22:00:00-07:00");
    const s: Situation = { ...emptySituation, arriveAt: "19:00", openOnly: true };
    const sc = scoreRecord(rec, s, { live: rows, now });

    // The strip and the findings must agree.
    expect(sc.open.state).toBe("open");
    expect(sc.findings.some((f) => f.id === "hours-closed")).toBe(false);
    // ...and nothing may charge "not serving" for a room that is serving.
    expect(sc.contributions.some((c) => /not serving/i.test(c.label))).toBe(false);
  });

  it("charges a closed room once, not twice", () => {
    // Tuesday 19:00 local, arriving 23:00 — closed either way.
    const now = new Date("2026-09-01T19:00:00-07:00");
    const s: Situation = { ...emptySituation, arriveAt: "23:00" };
    const sc = scoreRecord(rec, s, { live: rows, now });
    const closedTerms = sc.contributions.filter((c) => /not serving/i.test(c.label));
    expect(closedTerms.length).toBeLessThanOrEqual(1);
    // and it must not simultaneously award an "open until" bonus
    expect(sc.contributions.some((c) => /^open until/i.test(c.label))).toBe(false);
  });
});

describe("the score stays orderable", () => {
  it("keeps distinct order below the display floor", async () => {
    const rows = await live();
    const s: Situation = {
      ...emptySituation,
      occasion: "Group dining",
      partySize: 8,
      leadDays: 1,
      spendBand: "$",
      preferWalkIn: true,
      constraints: ["Severe allergy / celiac", "Mobility / step-free needs"],
      openOnly: true,
      arriveAt: "09:00",
    };
    const scored = rank(washington, s, { live: rows, now: new Date("2026-08-31T09:00:00-07:00") });
    // The clamped value collapses; the raw one must still discriminate.
    const distinctRaw = new Set(scored.map((x) => x.fitRaw)).size;
    expect(distinctRaw).toBeGreaterThan(3);
    // Blocked rooms are held to the end by design; within each group the
    // raw score must still order the list.
    const open = scored.filter((x) => !x.blocked).map((x) => x.fitRaw);
    const held = scored.filter((x) => x.blocked).map((x) => x.fitRaw);
    expect(open).toEqual([...open].sort((a, b) => b - a));
    expect(held).toEqual([...held].sort((a, b) => b - a));
    expect(scored.findIndex((x) => x.blocked) === -1 || scored.at(-1)!.blocked).toBe(true);
  });

  it("reports arithmetic that reconciles with the fit it shows", async () => {
    const rows = await live();
    const s: Situation = { ...emptySituation, occasion: "Date night", partySize: 2 };
    for (const sc of rank(washington, s, { live: rows }).slice(0, 12)) {
      const sum = sc.fitBase + sc.contributions.reduce((a, c) => a + c.delta, 0);
      expect(Math.abs(Math.round(sum) - sc.fitRaw)).toBeLessThanOrEqual(1);
    }
  });

  it("never produces a NaN score", async () => {
    const rows = await live();
    const s: Situation = { ...emptySituation, origin: [47.6, -122.3], originLabel: "x" };
    const broken = {
      ...rows,
      [washington[0]!.slug]: { ll: [47.6] as never, llSource: "exact" as const },
    };
    const sc = scoreRecord(washington[0]!, s, { live: broken });
    expect(Number.isFinite(sc.fit)).toBe(true);
    expect(Number.isFinite(sc.fitRaw)).toBe(true);
  });
});

describe("only rooms serving then", () => {
  it("actually removes rooms that are not serving", async () => {
    const rows = await live();
    const s: Situation = { ...emptySituation, openOnly: true, arriveAt: "09:00" };
    const kept = filterRecords(washington, s, rows);
    const dropped = washington.length - kept.length;
    expect(dropped).toBeGreaterThan(0);
    // Nothing kept may have a schedule that excludes the arrival.
    for (const r of kept) {
      const row = rows[r.slug];
      if (!row?.hours) continue;
      expect(servesAt(row, 1, 9 * 60)).not.toBe(false);
    }
  });

  it("keeps a room whose schedule is simply not held", async () => {
    const rows = await live();
    const noHours = washington.find((r) => !rows[r.slug]?.hours);
    expect(noHours).toBeDefined();
    const s: Situation = { ...emptySituation, openOnly: true, arriveAt: "09:00" };
    expect(filterRecords(washington, s, rows).map((r) => r.slug)).toContain(noHours!.slug);
  });
});

describe("fail-closed stays honest without blocking everything", () => {
  const base: Situation = { ...emptySituation, occasion: "Date night", partySize: 2 };

  it("does not block the whole corpus on a severe allergy", async () => {
    const rows = await live();
    const s: Situation = { ...base, constraints: ["Severe allergy / celiac"] };
    const scored = rank(washington, s, { live: rows });
    const blocked = scored.filter((x) => x.blocked).length;
    expect(blocked).toBeLessThan(scored.length);
    // and it still warns on every one of them
    for (const x of scored) {
      expect(x.criticals.some((f) => f.domain === "dietary")).toBe(true);
    }
  });

  it("does not block a room with reported step-free access", async () => {
    const rows = await live();
    const withAccess = washington.find((r) => rows[r.slug]?.a11y?.entrance);
    expect(withAccess).toBeDefined();
    const s: Situation = { ...base, constraints: ["Mobility / step-free needs"] };
    const scored = scoreRecord(withAccess!, s, { live: rows });
    expect(scored.blocked).toBe(false);
    expect(scored.findings.some((f) => f.id === "access-directory")).toBe(true);
  });

  it("still blocks when the restaurant states stairs", async () => {
    const rows = await live();
    const s: Situation = { ...base, constraints: ["Mobility / step-free needs"] };
    const stairs = washington.find((r) =>
      r.accessibilityTags.some((t) =>
        ["Stairs required", "Stairs stated", "No elevator"].includes(t),
      ),
    );
    if (!stairs) return; // region may hold none
    expect(scoreRecord(stairs, s, { live: rows }).blocked).toBe(true);
  });

  it("blocks a room that is not serving when openOnly is set", async () => {
    const rows = await live();
    const closed = washington.find((r) => {
      const row = rows[r.slug];
      return row?.hours && !servesAt(row, 1, 9 * 60); // Monday 9am
    });
    expect(closed).toBeDefined();
    const s: Situation = { ...base, openOnly: true, arriveAt: "09:00" };
    const scored = scoreRecord(closed!, s, {
      live: rows,
      now: new Date("2026-08-31T09:00:00-07:00"),
    });
    expect(scored.findings.some((f) => f.id === "hours-closed")).toBe(true);
  });
});
