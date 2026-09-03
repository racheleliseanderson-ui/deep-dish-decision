import { describe, expect, it } from "vitest";
import { distanceBand, formatDistance, readDistance } from "@/lib/live";

/**
 * The one thing that must never happen: a city centroid printed as a decimal.
 * 1,416 of 1,527 rooms have no address coordinate, so this is the difference
 * between a measurement and a number that looks like one.
 */
describe("readDistance", () => {
  it("gives an exact point a decimal and no qualifier", () => {
    const read = readDistance(3.24, true, "Chicago");
    expect(read.value).toBe("3.2 mi");
    expect(read.measuredTo).toBeNull();
    expect(formatDistance(3.24, true, "Chicago")).toBe("3.2 mi");
  });

  it("gives a centroid a band and always says what it measured to", () => {
    const read = readDistance(3.24, false, "Chicago");
    expect(read.value).toBe("2–5 mi");
    expect(read.measuredTo).toBe("to the middle of Chicago");
    expect(read.value).not.toMatch(/\d\.\d/);
  });

  it("never emits a decimal for a centroid at any distance", () => {
    for (const mi of [0.05, 0.4, 1.2, 2.9, 4.9, 7, 12, 24, 30, 60, 400]) {
      const read = readDistance(mi, false, "Bend");
      expect(read.value).not.toMatch(/\d\.\d/);
      expect(read.measuredTo).toBeTruthy();
      expect(formatDistance(mi, false, "Bend")).toContain("to the middle of Bend");
    }
  });

  it("falls back to 'town' when the city is not on the record", () => {
    expect(readDistance(4, false, "").measuredTo).toBe("to the middle of town");
    expect(readDistance(4, false, null).measuredTo).toBe("to the middle of town");
  });

  it("bands widen rather than pretending to precision", () => {
    expect(distanceBand(0.4)).toBe("under 1 mi");
    expect(distanceBand(1.5)).toBe("1–2 mi");
    expect(distanceBand(9.9)).toBe("5–10 mi");
    expect(distanceBand(51)).toBe("over 50 mi");
  });
});
