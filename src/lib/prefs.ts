import { useCallback, useEffect, useState } from "react";

/**
 * Display preferences that change how the instrument is read rather than what it
 * says: contrast mode (full colour / black-and-white / colour-blind safe) and
 * interface language. Persisted per browser, applied as classes on <html> so the
 * pre-hydration script in __root can restore them before first paint.
 */

export type ContrastMode = "standard" | "mono" | "cvd";
export type Locale = "en";

export const CONTRAST_KEY = "rih-contrast";
export const LOCALE_KEY = "rih-locale";
export const ENRICHMENT_KEY = "rih-enrichment-signals";

const EVENT = "rih-prefs";

const CONTRAST_CLASS: Record<ContrastMode, string> = {
  standard: "",
  mono: "mode-mono",
  cvd: "mode-cvd",
};

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key) as T | null;
    return raw && allowed.includes(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — session-only preference */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function applyContrast(mode: ContrastMode) {
  const root = document.documentElement;
  for (const cls of Object.values(CONTRAST_CLASS)) if (cls) root.classList.remove(cls);
  if (CONTRAST_CLASS[mode]) root.classList.add(CONTRAST_CLASS[mode]);
}

export function useContrastMode() {
  const [mode, setMode] = useState<ContrastMode>("standard");

  useEffect(() => {
    const sync = () => setMode(readStored<ContrastMode>(CONTRAST_KEY, ["standard", "mono", "cvd"], "standard"));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const set = useCallback((next: ContrastMode) => {
    applyContrast(next);
    store(CONTRAST_KEY, next);
    setMode(next);
  }, []);

  return { mode, set };
}

export function useLocale() {
  return {
    locale: "en" as Locale,
    set: (_next: Locale) => {},
  };
}


/** Labeled third-party enrichment signals in findings. Default ON; pure first-party when off. */
export function readEnrichmentEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENRICHMENT_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function useEnrichmentSignals() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const sync = () => setEnabled(readEnrichmentEnabled());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const set = useCallback((next: boolean) => {
    store(ENRICHMENT_KEY, next ? "1" : "0");
    setEnabled(next);
  }, []);

  return { enabled, set };
}
