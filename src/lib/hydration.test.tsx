import { readFileSync } from "node:fs";
import { StrictMode, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEnrichmentSignals, ENRICHMENT_KEY } from "@/lib/prefs";
import { decodeSituation } from "@/lib/situation-url";

/**
 * Hydration regression guard for the decision packet.
 *
 * The packet flashed empty on first load because it read browser-only state
 * (localStorage prefs, window.location.search) during render, so the server
 * markup and the first client render disagreed. These tests fail if that class
 * of bug returns: browser state must arrive through an effect or router state.
 */

/** Mirrors the packet's hydration-sensitive reads without the router shell. */
function PacketProbe({ searchStr }: { searchStr: string }) {
  const situation = decodeSituation(searchStr);
  const enrichment = useEnrichmentSignals();
  const [mounted] = useState("packet");
  return (
    <div data-testid={mounted}>
      <p>{`occasion:${situation.occasion ?? "not stated"}`}</p>
      <p>{`party:${situation.partySize ?? "not stated"}`}</p>
      <p>{`signals:${enrichment.enabled ? "on" : "off"}`}</p>
    </div>
  );
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  localStorage.clear();
  document.body.innerHTML = "";
});

async function hydrateProbe(searchStr: string) {
  const html = renderToString(
    <StrictMode>
      <PacketProbe searchStr={searchStr} />
    </StrictMode>,
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);

  await act(async () => {
    hydrateRoot(
      host,
      <StrictMode>
        <PacketProbe searchStr={searchStr} />
      </StrictMode>,
    );
  });
  return { html, host };
}

function hydrationComplaints() {
  return (errorSpy.mock.calls as unknown[][])
    .map((c) => c.map((a) => String(a)).join(" "))
    .filter((m: string) => /hydrat|did not match|server rendered/i.test(m));
}

describe("decision packet hydration", () => {
  it("hydrates a situation-bearing packet without mismatch", async () => {
    const { host } = await hydrateProbe("?o=Date+night&p=4&l=10");
    expect(hydrationComplaints()).toEqual([]);
    expect(host.textContent).toContain("occasion:Date night");
    expect(host.textContent).toContain("party:4");
  });

  it("hydrates cleanly when stored prefs disagree with the server default", async () => {
    // Server renders the default (signals on); this browser has them off.
    localStorage.setItem(ENRICHMENT_KEY, "0");
    const { host } = await hydrateProbe("?o=Business+dining&p=6");
    expect(hydrationComplaints()).toEqual([]);
    // Effect-applied preference wins after hydration — no render-time read.
    expect(host.textContent).toContain("signals:off");
  });

  it("never renders empty content on the first (server) pass", async () => {
    const { html } = await hydrateProbe("");
    expect(html).toContain("occasion:not stated");
    expect(html.replace(/<[^>]+>/g, "").trim().length).toBeGreaterThan(0);
  });

  it("keeps browser-only reads out of packet render code", () => {
    const src = readFileSync("src/routes/packet.$slug.tsx", "utf8");
    const renderScope = src.split("onClick")[0];
    expect(renderScope).not.toMatch(/window\.location/);
    expect(renderScope).not.toMatch(/localStorage/);
  });
});
