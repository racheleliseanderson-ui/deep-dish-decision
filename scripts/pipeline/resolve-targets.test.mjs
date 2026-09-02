/**
 * The guards in resolve-targets are the only thing standing between a curated
 * name list and a wrong record on a live site, so they are tested directly.
 * No network: every case here is about what the resolver believes, not fetching.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  addressFromLd,
  addressFromText,
  candidateUrls,
  pageNamesTarget,
  phoneFrom,
} from "./resolve-targets.mjs";

test("candidate domains cover the shapes operators actually use", () => {
  const urls = candidateUrls({ name: "Maxwells Trading" });
  assert.ok(urls.includes("https://www.maxwellstrading.com"));
  assert.ok(urls.some((u) => u.includes("maxwells.com")));
  assert.deepEqual(candidateUrls({ name: "Anything", url: "https://x.example" }), [
    "https://x.example",
  ]);
});

test("an apostrophe or accent does not change the domain guess", () => {
  assert.ok(candidateUrls({ name: "Gautreau's" }).includes("https://www.gautreaus.com"));
  assert.ok(candidateUrls({ name: "Léna" }).includes("https://www.lena.com"));
});

test("the page must name the restaurant", () => {
  assert.ok(pageNamesTarget("Welcome to Maxwells Trading, an all-day room.", null, "Maxwells Trading"));
  assert.ok(pageNamesTarget("nothing useful here", "Alpino", "Alpino"));
  assert.equal(pageNamesTarget("Bayview Diner serves breakfast", null, "Nepantla"), false);
});

test("a class word alone never counts as naming the restaurant", () => {
  // "The Kitchen" reduces to no distinctive token, so a page that merely says
  // "kitchen" must not satisfy it.
  assert.equal(pageNamesTarget("our kitchen is open", null, "The Kitchen"), false);
});

test("JSON-LD address is taken only when the city matches the target", () => {
  const node = {
    address: {
      streetAddress: "1426 Bagley St",
      addressLocality: "Detroit",
      addressRegion: "MI",
      postalCode: "48216",
    },
  };
  assert.equal(addressFromLd(node, "Detroit", "MI"), "1426 Bagley St, Detroit, MI 48216");
  // A group site listing a sibling branch must not leak into the record.
  assert.equal(addressFromLd(node, "Chicago", "IL"), null);
});

test("text address extraction is anchored on the target city and state", () => {
  assert.equal(
    addressFromText("Visit us at 2800 Magazine Street, New Orleans, LA 70115.", "New Orleans", "LA"),
    "2800 Magazine Street, New Orleans, LA 70115",
  );
  assert.equal(addressFromText("400 Main St, Oakland, CA 94607", "New Orleans", "LA"), null);
  assert.equal(addressFromText("no address at all", "Detroit", "MI"), null);
});

test("phone is normalised, and absent rather than guessed", () => {
  assert.equal(phoneFrom({ telephone: "(313) 262-6115" }, ""), "+1-313-262-6115");
  assert.equal(phoneFrom(null, "call us on 504.265.0421 today"), "+1-504-265-0421");
  assert.equal(phoneFrom(null, "no number on this page"), "");
  // A short or malformed number yields nothing at all.
  assert.equal(phoneFrom({ telephone: "555-1234" }, ""), "");
});
