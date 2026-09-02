import { emptySituation, type Situation } from "@/lib/intelligence";

const KEY = "deep-dish-night-context:v1";
export const NIGHT_CONTEXT_EVENT = "deep-dish-night-context-change";

export function saveNightContext(situation: Situation) {
  if (typeof window === "undefined") return;
  const safe: Situation = {
    ...situation,
    // The named area is enough to reopen the decision. Do not persist precise coordinates.
    origin: null,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(safe));
  } catch {
    // Context remains available in the current route when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(NIGHT_CONTEXT_EVENT));
}

export function readNightContext(): Situation {
  if (typeof window === "undefined") return { ...emptySituation };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...emptySituation };
    const parsed = JSON.parse(raw) as Partial<Situation>;
    return {
      ...emptySituation,
      ...parsed,
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
      origin: null,
    };
  } catch {
    return { ...emptySituation };
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
