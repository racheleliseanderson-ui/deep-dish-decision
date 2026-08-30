import { describe, expect, it } from "vitest";
import {
  batchMatchesCityFilter,
  findQueueTarget,
  queueCityForBatch,
} from "./seed-target.mjs";

const queue = {
  cities: [
    { city: "Atlanta", stateCode: "GA", priority: 6 },
    { city: "new jersey", stateCode: "NJ", priority: 79 },
  ],
};

describe("seed queue target mapping", () => {
  it("preserves legacy city-as-queue-target behavior", () => {
    const batch = { city: "Atlanta", stateCode: "GA" };
    expect(queueCityForBatch(batch)).toBe("Atlanta");
    expect(findQueueTarget(queue, batch)?.priority).toBe(6);
    expect(batchMatchesCityFilter(batch, ["atlanta"])).toBe(true);
  });

  it("maps a real restaurant city to a broader statewide queue target", () => {
    const batch = { city: "Newark", queueCity: "new jersey", stateCode: "NJ" };
    expect(queueCityForBatch(batch)).toBe("new jersey");
    expect(findQueueTarget(queue, batch)?.priority).toBe(79);
    expect(batchMatchesCityFilter(batch, ["newark"])).toBe(true);
    expect(batchMatchesCityFilter(batch, ["new jersey"])).toBe(true);
  });

  it("does not match unrelated city filters", () => {
    const batch = { city: "Princeton", queueCity: "new jersey", stateCode: "NJ" };
    expect(batchMatchesCityFilter(batch, ["newark"])).toBe(false);
  });
});
