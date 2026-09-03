import { describe, expect, it } from "vitest";
import { readCrossContact, splitByCrossContact } from "@/lib/cross-contact";
import type { RestaurantRecord } from "@/lib/dataset";

function record(fields: Partial<RestaurantRecord>): RestaurantRecord {
  return {
    dietaryDetails: "",
    menuSummary: "",
    practicalNotes: "",
    ...fields,
  } as RestaurantRecord;
}

describe("readCrossContact", () => {
  it("reads a published cross-contact statement, including a refusal", () => {
    const read = readCrossContact(
      record({
        dietaryDetails:
          "The restaurant publishes vegetarian and gluten-free modifications. Certain foundational ingredients cannot be removed, and cross-contact cannot be guaranteed.",
      }),
    );
    expect(read.state).toBe("published");
    expect(read.field).toBe("dietaryDetails");
    expect(read.evidence).toMatch(/cross-contact cannot be guaranteed/);
  });

  it("does not promote our own hedge into the restaurant's evidence", () => {
    // This sentence is Deep Dish talking, and it mentions cross-contact.
    // Counting it would triple the size of the published list overnight.
    const read = readCrossContact(
      record({
        dietaryDetails:
          "A comprehensive dietary or cross-contact policy was not published on the reviewed first-party pages. Individual needs require direct confirmation with the restaurant.",
      }),
    );
    expect(read.state).toBe("silent");
    expect(read.evidence).toBeNull();
  });

  it("keeps published options separate from published practice", () => {
    const read = readCrossContact(
      record({ dietaryDetails: "A dedicated vegan menu is published." }),
    );
    expect(read.state).toBe("dietary-only");
  });

  it("treats the leveling floor sentence as silence", () => {
    const read = readCrossContact(
      record({
        dietaryDetails: "Not stated on the restaurant's own pages; ask before booking.",
      }),
    );
    expect(read.state).toBe("silent");
  });

  it("reads a verbatim lift from the restaurant's own pages", () => {
    const read = readCrossContact(
      record({
        dietaryDetails:
          "Dietary wording from the restaurant's own pages: Please advise the restaurant of any dietary restrictions and allergies when dining in or placing a carry out order.",
      }),
    );
    expect(read.state).toBe("published");
  });

  it("accepts a hard allergen marker from the menu field only", () => {
    expect(
      readCrossContact(record({ menuSummary: "Menus are published with allergen notices." })).state,
    ).toBe("published");
    expect(readCrossContact(record({ menuSummary: "Please tell us about allergies." })).state).toBe(
      "silent",
    );
  });
});

describe("splitByCrossContact", () => {
  it("partitions in the incoming order", () => {
    const rows = [
      record({ dietaryDetails: "A vegetarian tasting menu is published." }),
      record({ dietaryDetails: "An official allergen guide is available." }),
      record({ dietaryDetails: "" }),
    ];
    const split = splitByCrossContact(rows, (r) => r);
    expect(split.published).toHaveLength(1);
    expect(split.dietaryOnly).toHaveLength(1);
    expect(split.silent).toHaveLength(1);
  });
});
