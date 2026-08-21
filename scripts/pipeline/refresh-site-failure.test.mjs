import { describe, expect, it } from "vitest";
import { siteFailureMap } from "./refresh.mjs";

describe("siteFailureMap latest owned-site state", () => {
  it("clears an older failure when the newest owned-site run succeeded", () => {
    const log = {
      runs: [
        {
          kind: "enrich-owned",
          records: [
            {
              slug: "example-room",
              matchStatus: "resolved",
              notes: ["pages 4", "quotes 8"],
            },
          ],
        },
        {
          kind: "hygiene-owned",
          records: [
            {
              slug: "example-room",
              matchStatus: "site-failure",
              notes: ["site 429"],
            },
          ],
        },
      ],
    };

    expect(siteFailureMap(log).has("example-room")).toBe(false);
  });

  it("keeps the failure when the newest owned-site observation failed", () => {
    const log = {
      runs: [
        {
          kind: "hygiene-owned",
          records: [
            {
              slug: "example-room",
              matchStatus: "site-failure",
              notes: ["site 408 timeout:UND_ERR_CONNECT_TIMEOUT"],
            },
          ],
        },
        {
          kind: "enrich-owned",
          records: [
            {
              slug: "example-room",
              matchStatus: "resolved",
              notes: ["pages 3"],
            },
          ],
        },
      ],
    };

    expect(siteFailureMap(log).get("example-room")).toEqual([
      "site 408 timeout:UND_ERR_CONNECT_TIMEOUT",
    ]);
  });

  it("ignores non-enrichment run records when resolving latest site state", () => {
    const log = {
      runs: [
        {
          kind: "retire-closed",
          records: [{ slug: "example-room", notes: [] }],
        },
        {
          kind: "hygiene-owned",
          records: [
            {
              slug: "example-room",
              matchStatus: "site-failure",
              notes: ["site 500"],
            },
          ],
        },
      ],
    };

    expect(siteFailureMap(log).get("example-room")).toEqual(["site 500"]);
  });
});
