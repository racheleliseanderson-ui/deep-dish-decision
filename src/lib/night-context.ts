import { emptySituation, type Situation } from "@/lib/intelligence";

const KEY = "deep-dish-night-context:v2";
export const NIGHT_CONTEXT_EVENT = "deep-dish-night-context-change";

export type NightDetails = {
  hardEndAt: string | null;
};

export type StoredNightContext = {
  situation: Situation;
  details: NightDetails;
};

export const emptyNightDetails: NightDetails = {
  hardEndAt: null,
};

export function saveNightContext(situation: Situation, details: NightDetails = emptyNightDetails) {
  if (typeof window === "undefined") return;
  const safe: StoredNightContext = {
    situation: {
      ...situation,
      // The named area is enough to reopen the decision. Do not persist precise coordinates.
      origin: null,
    },
    details,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(safe));
  } catch {
    // Context remains available in the current route when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(NIGHT_CONTEXT_EVENT));
}

export function readNightContext(): StoredNightContext {
  if (typeof window === "undefined") {
    return { situation: { ...emptySituation }, details: { ...emptyNightDetails } };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { situation: { ...emptySituation }, details: { ...emptyNightDetails } };
    const parsed = JSON.parse(raw) as Partial<StoredNightContext>;
    const incoming = parsed.situation ?? {};
    return {
      situation: {
        ...emptySituation,
        ...incoming,
        constraints: Array.isArray(incoming.constraints) ? incoming.constraints : [],
        origin: null,
      },
      details: {
        hardEndAt: typeof parsed.details?.hardEndAt === "string" ? parsed.details.hardEndAt : null,
      },
    };
  } catch {
    return { situation: { ...emptySituation }, details: { ...emptyNightDetails } };
  }
}

export function clearNightContext() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing else to do.
  }
  window.dispatchEvent(new CustomEvent(NIGHT_CONTEXT_EVENT));
}
