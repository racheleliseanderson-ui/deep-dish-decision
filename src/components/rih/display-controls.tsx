import { ThemeToggle } from "@/components/rih/theme-toggle";
import { useT } from "@/lib/i18n";
import { useContrastMode, type ContrastMode, type Locale } from "@/lib/prefs";
import { cn } from "@/lib/utils";

const SEG =
  "min-h-11 min-w-11 rounded-full px-3 text-[11px] uppercase tracking-[0.14em] transition-colors duration-300 ease-instrument sm:min-h-9";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-raised/70 p-0.5 backdrop-blur"
      role="group"
      aria-label={label}
    >
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            SEG,
            value === v ? "bg-primary/15 text-primary" : "text-subtle hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * Reading controls: paper/instrument, contrast mode (full colour, black-and-white,
 * colour-blind safe) and interface language. Touch targets clear 44px on phones.
 */
export function DisplayControls({ className }: { className?: string }) {
  const { t, locale, setLocale } = useT();
  const { mode, set } = useContrastMode();

  return (
    <div className={cn("no-print flex flex-wrap items-center gap-2", className)}>
      <ThemeToggle />
      <Segmented<ContrastMode>
        label={t("prefs.contrast")}
        value={mode}
        onChange={set}
        options={[
          ["standard", t("prefs.colour")],
          ["mono", t("prefs.mono")],
          ["cvd", t("prefs.cvd")],
        ]}
      />
      <Segmented<Locale>
        label={t("prefs.language")}
        value={locale}
        onChange={setLocale}
        options={[
          ["en", "EN"],
          ["es", "ES"],
        ]}
      />
    </div>
  );
}
