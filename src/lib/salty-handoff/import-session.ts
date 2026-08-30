/**
 * SALTY HANDOFF v2 — the import gate.
 *
 * VENDORED FILE — byte-identical in all four Salty & Clever apps. See contract.ts.
 *
 * The one rule this file exists to enforce: arriving context is never applied by
 * the act of arriving. A valid packet becomes an OFFER. It becomes state only
 * when the user presses the button. If the user already has work in progress,
 * the offer says so before they choose.
 */

import type { HandoffResult, SaltyHandoff } from "./contract.ts";

export type ImportPhase = "idle" | "offered" | "applied" | "dismissed" | "failed";

export interface ImportSession {
  phase: ImportPhase;
  handoff: SaltyHandoff | null;
  /** Plain-language line for the panel. Empty when there is nothing to say. */
  message: string;
  /** True when applying would replace work the user already has here. */
  overwrites: boolean;
  /** True when the packet is valid but over a week old. */
  stale: boolean;
  /** Unknown fields we ignored. Developer signal only — never rendered. */
  dropped: string[];
}

export const IDLE: ImportSession = {
  phase: "idle",
  handoff: null,
  message: "",
  overwrites: false,
  stale: false,
  dropped: [],
};

/**
 * Turn a decode result into a session.
 *
 * - no packet            → idle, app behaves exactly as a direct visit
 * - unreadable packet    → failed, with a short friendly line, app continues
 * - readable packet      → OFFERED. Never "applied". Not even when the user has
 *                          no existing work: an explicit action is the contract.
 */
export function beginImport(result: HandoffResult, hasExistingWork: boolean): ImportSession {
  if (result.ok) {
    return {
      phase: "offered",
      handoff: result.handoff,
      message: "",
      overwrites: hasExistingWork,
      stale: result.stale,
      dropped: result.dropped,
    };
  }
  if (result.reason === "absent") return IDLE;
  return { ...IDLE, phase: "failed", message: result.message };
}

/** Apply is only reachable from an offer. Anything else is a no-op. */
export function applyImport(session: ImportSession): ImportSession {
  if (session.phase !== "offered" || !session.handoff) return session;
  return { ...session, phase: "applied", overwrites: false };
}

export function dismissImport(session: ImportSession): ImportSession {
  if (session.phase === "idle") return session;
  return { ...IDLE, phase: "dismissed" };
}

/** True only when the caller may write the handoff into application state. */
export function shouldApply(session: ImportSession): boolean {
  return session.phase === "applied" && session.handoff !== null;
}
