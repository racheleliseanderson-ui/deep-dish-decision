import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "dark" | "light";

const KEY = "rih-theme";

function apply(mode: Mode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable — session-only theme */
  }
}

/**
 * Reading light (printed brief) vs instrument dark. Resolved after hydration so
 * SSR markup stays stable; the pre-hydration script in __root sets the class.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    setMode(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const set = (next: Mode) => {
    setMode(next);
    apply(next);
  };

  return (
    <div
      className={cn(
        "no-print inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-raised/70 p-0.5 backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Reading mode"
    >
      {(
        [
          ["light", "Paper"],
          ["dark", "Instrument"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => set(value)}
          aria-pressed={mode === value}
          className={cn(
            "rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ease-instrument",
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
