import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type DisplayMode = "navy" | "pearl";

/**
 * Browser chrome, one value per ground: --background rendered to sRGB.
 *
 * __root.tsx emits these as the OS-keyed <meta name="theme-color"> fallback and
 * inlines them into the pre-paint script, and applyMode rewrites the same
 * elements on toggle. One definition, so the chrome and the page cannot end up
 * different navies.
 */
export const THEME_COLOR = { navy: "#0c1220", pearl: "#f9fafd" } as const;

const MODE_KEY = "sc-mode";
const CVD_KEY = "sc-cvd";
const LEGACY_THEME = "rih-theme";
const LEGACY_CONTRAST = "rih-contrast";

function readMode(): DisplayMode {
  try {
    const stored = localStorage.getItem(MODE_KEY) || localStorage.getItem(LEGACY_THEME);
    if (stored === "pearl" || stored === "light") return "pearl";
    return "navy";
  } catch {
    return "navy";
  }
}

function readCvd(): boolean {
  try {
    if (localStorage.getItem(CVD_KEY) === "on") return true;
    if (localStorage.getItem(CVD_KEY) === "off") return false;
    if (localStorage.getItem(LEGACY_CONTRAST) === "cvd") return true;
    if (localStorage.getItem(LEGACY_THEME) === "colorblind") return true;
  } catch {
    /* storage unavailable */
  }
  return typeof document !== "undefined" && document.documentElement.classList.contains("cvd");
}

/**
 * Write the active ground's colour onto every theme-color meta.
 *
 * Content only: the elements themselves belong to the head React rendered, and
 * adding or removing one would put a node in the head that React did not put
 * there. Both metas get the same value, so whichever the browser's media query
 * selects is the one the reader actually chose.
 */
export function syncThemeColor(mode: DisplayMode = readMode()) {
  if (typeof document === "undefined") return;
  const color = mode === "pearl" ? THEME_COLOR.pearl : THEME_COLOR.navy;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((el) => el.setAttribute("content", color));
}

export function applyMode(mode: DisplayMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode !== "pearl");
  root.classList.toggle("light", mode === "pearl");
  syncThemeColor(mode);
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(LEGACY_THEME, mode === "pearl" ? "light" : "dark");
  } catch {
    /* storage unavailable — session-only */
  }
}

export function applyCvd(on: boolean) {
  const root = document.documentElement;
  root.classList.toggle("cvd", on);
  root.classList.toggle("mode-cvd", on);
  try {
    localStorage.setItem(CVD_KEY, on ? "on" : "off");
    localStorage.removeItem(LEGACY_CONTRAST);
  } catch {
    /* storage unavailable — session-only */
  }
}

/**
 * Navy and Pearl are exclusive grounds. CVD is an independent overlay
 * (brass / cyan instead of brass / oxblood). Language is English only.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<DisplayMode>("navy");
  const [cvd, setCvd] = useState(false);

  useEffect(() => {
    setMode(readMode());
    setCvd(readCvd());
  }, []);

  const set = (next: DisplayMode) => {
    setMode(next);
    applyMode(next);
  };

  const toggleCvd = () => {
    const next = !cvd;
    setCvd(next);
    applyCvd(next);
  };

  return (
    <div className={cn("no-print inline-flex items-center gap-1", className)}>
      <div
        className="inline-flex items-center gap-0.5 rounded-sm border border-border p-0.5"
        role="group"
        aria-label="Appearance"
      >
        {(
          [
            ["navy", "Navy"],
            ["pearl", "Pearl"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => set(value)}
            aria-pressed={mode === value}
            className={cn(
              "tap min-h-11 rounded-sm px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ease-instrument sm:min-h-0",
              mode === value ? "bg-primary/15 text-primary" : "text-subtle hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={toggleCvd}
        aria-pressed={cvd}
        title="Colour-vision-safe palette (brass / cyan signal)"
        className={cn(
          "tap min-h-11 rounded-sm border border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ease-instrument sm:min-h-0",
          cvd ? "bg-primary/15 text-primary" : "text-subtle hover:text-foreground",
        )}
      >
        CVD
      </button>
    </div>
  );
}
