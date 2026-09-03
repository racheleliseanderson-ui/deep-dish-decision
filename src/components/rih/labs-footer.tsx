import { Link } from "@tanstack/react-router";
import { FOOTER_NAV_LINKS } from "@/components/rih/nav-links";
import { useT } from "@/lib/i18n";

/**
 * In-app footer — same-origin links only.
 * Gold hairline is the house mark. Identity and disclaimer stay text.
 */

export function LabsFooter() {
  const { t } = useT();

  return (
    <footer className="no-print mt-24 bg-ink text-ink-foreground">
      <div aria-hidden className="h-px w-full bg-house-gold" />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <p className="text-eyebrow text-house-gold">Northern Lantern House Labs</p>
        <h2 className="mt-3 font-display text-2xl tracking-tight sm:text-3xl">Deep Dish</h2>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-ink-foreground/70">
          What the record actually supports for tonight.
        </p>

        <nav aria-label="In this site" className="mt-10">
          <p className="text-eyebrow text-ink-foreground/78">In this site</p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            {FOOTER_NAV_LINKS.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="tap inline-flex items-center text-ink-foreground/70 transition-colors hover:text-ink-foreground"
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="mt-12 border-t border-ink-foreground/15 pt-6 text-[12px] text-ink-foreground/80">
          © 2026 Salty & Clever
        </p>
      </div>
    </footer>
  );
}
