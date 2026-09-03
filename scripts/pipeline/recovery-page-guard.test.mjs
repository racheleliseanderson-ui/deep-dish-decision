import { describe, expect, it } from "vitest";
import { blockedRenderedPage } from "./recovery-page-guard.mjs";

describe("browser recovery denial guard", () => {
  it("rejects Cloudflare challenge pages", () => {
    const html =
      "<html><title>Just a moment...</title><body>Enable JavaScript and cookies to continue<div class='cf-browser-verification'></div></body></html>";
    expect(blockedRenderedPage(html, "Enable JavaScript and cookies to continue")).toBe(true);
  });

  it("rejects generic access-denied and human-verification pages", () => {
    expect(
      blockedRenderedPage(
        "<html><body>Access Denied - Error 403</body></html>",
        "Access Denied - Error 403",
      ),
    ).toBe(true);
    expect(
      blockedRenderedPage("<html><body>Verify you are human</body></html>", "Verify you are human"),
    ).toBe(true);
  });

  it("accepts ordinary restaurant copy", () => {
    const copy =
      "Dinner is served Tuesday through Saturday. Reservations are available online. Seasonal dishes change with the market.";
    expect(blockedRenderedPage(`<html><body>${copy}</body></html>`, copy)).toBe(false);
  });
});
