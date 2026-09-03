import type { Finding, Situation } from "@/lib/intelligence";
import type { NightDetails } from "@/lib/night-context";

export type DecisionState = "good" | "verify" | "hold";
export type ConfirmationStatus = "confirmed" | "cannot" | "unclear";
export type ConfirmationMethod = "website" | "call" | "email" | "other";

export type ConfirmationEvidence = {
  status: ConfirmationStatus;
  method: ConfirmationMethod | null;
  checkedAt: string | null;
  note: string;
};

export type ConfirmationMap = Record<string, ConfirmationEvidence>;

export const CONFIRMATION_EVENT = "deep-dish-confirmation-change";

function stableSituationKey(situation: Situation, details: NightDetails): string {
  const parts = [
    situation.regionGroup ?? "",
    situation.region ?? "",
    situation.occasion ?? "",
    [...situation.constraints].sort().join("|"),
    situation.partySize ?? "",
    situation.leadDays ?? "",
    situation.arriveAt ?? "",
    details.hardEndAt ?? "",
    situation.spendBand ?? "",
    situation.cuisine ?? "",
  ];
  return encodeURIComponent(parts.join("~"));
}

export function confirmationStorageKey(
  slug: string,
  situation: Situation,
  details: NightDetails,
): string {
  return `deep-dish-confirm:v2:${slug}:${stableSituationKey(situation, details)}`;
}

function normalizeEntry(value: unknown): ConfirmationEvidence | null {
  if (value === "confirmed" || value === "cannot" || value === "unclear") {
    return {
      status: value,
      method: null,
      checkedAt: null,
      note: "",
    };
  }
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ConfirmationEvidence>;
  if (raw.status !== "confirmed" && raw.status !== "cannot" && raw.status !== "unclear")
    return null;
  const method =
    raw.method === "website" ||
    raw.method === "call" ||
    raw.method === "email" ||
    raw.method === "other"
      ? raw.method
      : null;
  return {
    status: raw.status,
    method,
    checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt : null,
    note: typeof raw.note === "string" ? raw.note : "",
  };
}

export function readConfirmationEvidence(
  slug: string,
  situation: Situation,
  details: NightDetails,
): ConfirmationMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(confirmationStorageKey(slug, situation, details));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: ConfirmationMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalized = normalizeEntry(value);
      if (normalized) result[key] = normalized;
    }
    return result;
  } catch {
    return {};
  }
}

export function writeConfirmationEvidence(
  slug: string,
  situation: Situation,
  details: NightDetails,
  map: ConfirmationMap,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(confirmationStorageKey(slug, situation, details), JSON.stringify(map));
  } catch {
    // Current-session behavior still works when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(CONFIRMATION_EVENT, { detail: { slug } }));
}

export function updateConfirmationEvidence(
  current: ConfirmationMap,
  findingId: string,
  patch: Partial<ConfirmationEvidence> & Pick<ConfirmationEvidence, "status">,
): ConfirmationMap {
  const prior = current[findingId];
  return {
    ...current,
    [findingId]: {
      status: patch.status,
      method: patch.method ?? prior?.method ?? null,
      checkedAt: patch.checkedAt ?? prior?.checkedAt ?? new Date().toISOString(),
      note: patch.note ?? prior?.note ?? "",
    },
  };
}

export function setConfirmationDetail(
  current: ConfirmationMap,
  findingId: string,
  patch: Partial<Pick<ConfirmationEvidence, "method" | "note">>,
): ConfirmationMap {
  const prior = current[findingId];
  if (!prior) return current;
  return {
    ...current,
    [findingId]: {
      ...prior,
      ...patch,
    },
  };
}

export function confirmationSummary(
  baseState: DecisionState,
  findings: Finding[],
  evidence: ConfirmationMap,
) {
  const confirmed = findings.filter((finding) => evidence[finding.id]?.status === "confirmed");
  const cannot = findings.filter((finding) => evidence[finding.id]?.status === "cannot");
  const unclear = findings.filter((finding) => evidence[finding.id]?.status === "unclear");
  const unanswered = findings.filter((finding) => !evidence[finding.id]);
  const unresolved = findings.filter((finding) => {
    const status = evidence[finding.id]?.status;
    return status !== "confirmed" && status !== "cannot";
  });

  let state: DecisionState;
  if (cannot.length) {
    state = "hold";
  } else if (unanswered.some((finding) => finding.layer === "critical")) {
    state = "hold";
  } else if (baseState === "hold" && findings.length === 0) {
    state = "hold";
  } else if (unresolved.length || unclear.length) {
    state = "verify";
  } else {
    state = "good";
  }

  return {
    state,
    confirmed,
    cannot,
    unclear,
    unanswered,
    unresolved,
    readyToBook: state === "good",
  };
}
