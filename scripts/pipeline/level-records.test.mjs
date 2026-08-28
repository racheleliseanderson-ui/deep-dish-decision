import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canFill,
  emptyish,
  FLOOR_PREFIX,
  floor,
  formatHoursSummary,
  formatPhone,
  formatPriceDetails,
  formatCuisineContext,
  isOurFloor,
  isQuestion,
  measureDepth,
  platformFromUrl,
  stripPrefix,
} from "./level-format.mjs";

describe("level-format", () => {
  it("formats US telephone numbers from JSON-LD", () => {
    assert.equal(formatPhone(stripPrefix("JSON-LD telephone: 6262869996")), "(626) 286-9996");
    assert.equal(formatPhone("(973) 589-4767"), "(973) 589-4767");
    assert.equal(formatPhone("16096888808"), "(609) 688-8808");
  });

  it("compacts openingHoursSpecification quotes into a diner-facing summary", () => {
    const summary = formatHoursSummary([
      "JSON-LD openingHoursSpecification: Sunday 11:00 AM 03:00 PM",
      "JSON-LD openingHoursSpecification: Sunday 05:00 PM 09:30 PM",
      "JSON-LD openingHoursSpecification: Monday 11:00 AM 03:00 PM",
      "JSON-LD openingHoursSpecification: Monday 05:00 PM 09:30 PM",
    ]);
    assert.match(summary, /Hours as published on the restaurant's own pages/);
    assert.doesNotMatch(summary, /JSON-LD/);
    assert.match(summary, /Sunday/);
    assert.match(summary, /11:00 AM/);
  });

  it("reads compact openingHours strings", () => {
    const summary = formatHoursSummary([
      "JSON-LD openingHours: Su-Th 16:00-22:00; Fr-Sa 16:00-23:00",
    ]);
    assert.match(summary, /Sunday–Thursday/);
    assert.match(summary, /4:00 PM–10:00 PM/);
    assert.match(summary, /Friday–Saturday/);
  });

  it("formats price bands without inventing a dollar amount", () => {
    assert.equal(
      formatPriceDetails(["JSON-LD priceRange: $$"]),
      "Price band $$ as published on the restaurant's own pages.",
    );
    assert.match(formatPriceDetails(["JSON-LD priceRange: $5 - $45"]), /\$5 - \$45/);
  });

  it("formats cuisine from servesCuisine", () => {
    const cuisine = formatCuisineContext(["JSON-LD servesCuisine: Mexican, Latin-american, Tacos"]);
    assert.match(cuisine, /Mexican/);
    assert.match(cuisine, /named on the restaurant's own pages/);
  });

  it("does not treat questions as usable access facts", () => {
    assert.equal(isQuestion("is the building wheelchair accessible?"), true);
    assert.equal(isQuestion("The dining room is wheelchair accessible."), false);
  });

  it("lets evidence replace our floor sentences but not original prose", () => {
    assert.equal(emptyish(""), true);
    assert.equal(canFill(floor("hours were not published")), true);
    assert.equal(
      canFill("Dinner is served Tuesday through Saturday evenings beginning at 5 PM."),
      false,
    );
    assert.equal(isOurFloor(`${FLOOR_PREFIX} — hours were not published.`), true);
  });

  it("detects booking platforms from owned reservation URLs", () => {
    assert.equal(platformFromUrl("https://www.exploretock.com/canlis", "Tock"), "Tock");
    assert.equal(platformFromUrl("https://resy.com/cities/ny/foo", ""), "Resy");
    assert.equal(platformFromUrl("https://canlis.com/reservations", "Direct"), "Direct / confirm live");
  });

  it("counts a complete 12-field file including honest unstated sentences", () => {
    const record = Object.fromEntries(
      [
        "phone",
        "hoursSummary",
        "priceDetails",
        "cuisineContext",
        "menuSummary",
        "reservationDetails",
        "dietaryDetails",
        "accessibilityState",
        "groupDetails",
        "dressCode",
        "atmosphereSummary",
        "serviceSummary",
      ].map((k) => [k, floor(k)]),
    );
    record.phone = "(206) 283-3313";
    record.menuUrl = "";
    record.reservationUrl = "";
    const depth = measureDepth(record);
    assert.equal(depth.depthFilled, 12);
    assert.equal(depth.isFullCaseFile, true);
    assert.ok(depth.thinFieldCount >= 1);
  });
});
