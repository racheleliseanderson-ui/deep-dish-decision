import { describe, expect, it } from "vitest";
import { confirmationSummary, type ConfirmationMap } from "@/lib/confirmation-evidence";
import type { Finding } from "@/lib/intelligence";

const critical: Finding = {
  id: "critical",
  layer: "critical",
  domain: "diet",
  title: "Allergy handling needs confirmation",
  detail: "Not stated",
  action: "Call",
  impact: 95,
  confidence: "moderate",
  situational: true,
};

const watch: Finding = {
  id: "watch",
  layer: "watch",
  domain: "booking",
  title: "Seating time needs confirmation",
  detail: "Not stated",
  action: "Check reservations",
  impact: 50,
  confidence: "moderate",
  situational: true,
};

function evidence(status: "confirmed" | "cannot" | "unclear"): ConfirmationMap {
  return {
    critical: {
      status,
      method: "call",
      checkedAt: "2026-09-02T13:00:00.000Z",
      note: "host answered",
    },
  };
}

describe("confirmationSummary", () => {
  it("keeps an unanswered critical finding on hold", () => {
    expect(confirmationSummary("hold", [critical], {}).state).toBe("hold");
  });

  it("rehabilitates a hold when the critical condition is confirmed", () => {
    const summary = confirmationSummary("hold", [critical], evidence("confirmed"));
    expect(summary.state).toBe("good");
    expect(summary.readyToBook).toBe(true);
    expect(summary.unresolved).toHaveLength(0);
  });

  it("turns a critical condition marked still unclear into verify first", () => {
    const summary = confirmationSummary("hold", [critical], evidence("unclear"));
    expect(summary.state).toBe("verify");
    expect(summary.readyToBook).toBe(false);
    expect(summary.unresolved).toEqual([critical]);
  });

  it("keeps cannot accommodate on hold but removes it from unresolved", () => {
    const summary = confirmationSummary("hold", [critical], evidence("cannot"));
    expect(summary.state).toBe("hold");
    expect(summary.cannot).toEqual([critical]);
    expect(summary.unresolved).toHaveLength(0);
  });

  it("clears a verify-first state when its material watch item is confirmed", () => {
    const map: ConfirmationMap = {
      watch: {
        status: "confirmed",
        method: "website",
        checkedAt: "2026-09-02T13:00:00.000Z",
        note: "live reservation page checked",
      },
    };
    expect(confirmationSummary("verify", [watch], map).state).toBe("good");
  });
});
