import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Appearance = "dark" | "light" | "colorblind";

const KEY = "rih-theme";
const CONTRAST_KEY = "rih-contrast";

export function readAppearance(): Appearance {
  try {
    const theme = localStorage.getItem(KEY);
    const contrast = localStorage.getItem(CONTRAST_KEY);
    if (theme === "colorblind" || contrast === "cvd") return "colorblind";
    if (theme === "light") return "light";
    return "dark";
  } catch {
    return "dark";
  }
}

export function applyAppearance(mode: Appearance) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode !== "light");
  root.classList.remove("mode-mono", "mode-cvd");
  if (mode === "colorblind") root.classList.add("mode-cvd");
  try {
    localStorage.setItem(KEY, mode);
    localStorage.removeItem(CONTRAST_KEY);
  } catch {
    /* storage unavailable — session-only */
  }
}

/**
 * Dark, light, or colorblind. Colorblind uses the CVD-safe palette on the
 * instrument (dark) ground. Resolved after hydration so SSR stays stable;
 * the pre-hydration script in __root sets the class.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Appearance>("dark");

  useEffect(() => {
    setMode(readAppearance());
  }, []);

  const set = (next: Appearance) => {
    setMode(next);
    applyAppearance(next);
  };

  return (
    <div
      className={cn(
        "no-print inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-raised/70 p-0.5 backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Appearance"
    >
      {(
        [
          ["dark", "Dark"],
          ["light", "Light"],
          ["colorblind", "Colorblind"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => set(value)}
          aria-pressed={mode === value}
          className={cn(
            "tap min-h-11 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ease-instrument sm:min-h-0",
            mode === value
              ? "bg-primary/15 text-primary"
              : "text-subtle hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
