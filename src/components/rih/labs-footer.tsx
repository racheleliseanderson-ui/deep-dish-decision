import { HOUSE_URL } from "@/components/rih/house-bar";

/**
 * Northern Lantern House Labs footer — identical structure across the fleet.
 * Deepest ground, opened by a house-gold hairline, three columns, one bottom
 * rule. This is the only place the fleet is enumerated.
 */

type Item = { label: string; href: string };

const HOUSE: Item = { label: "northernlanternhouse.com", href: HOUSE_URL };

const PUBLICATION: Item[] = [
  { label: "Salty & Clever", href: "https://saltnotes.blog" },
  { label: "Salty Desk", href: "https://salty.saltnotes.blog" },
  { label: "Kitchen & Bar", href: "https://kitchen.saltnotes.blog" },
  { label: "Menu Builder", href: "https://occasion.saltnotes.blog/architecture" },
  { label: "Occasion OS", href: "https://occasion.saltnotes.blog" },
  { label: "Restaurant Intelligence", href: "https://deepdish.saltnotes.blog" },
];

const FLEET: Item[] = [
  { label: "Tangled Thistle", href: "https://tangledthistle.blog" },
  { label: "Atmosphere OS", href: "https://atmosphere.tangledthistle.blog" },
  { label: "Venue Intelligence", href: "https://venue.tangledthistle.blog" },
  { label: "Vanity or Vice", href: "https://vanityvice.blog" },
  { label: "Makeup Intelligence", href: "https://makeup.vanityvice.blog" },
  { label: "Skincare Desk", href: "https://skincare.vanityvice.blog" },
  { label: "Spa Intelligence", href: "https://spa.vanityvice.blog" },
  { label: "Room for Drama", href: "https://dramaroom.blog" },
  { label: "Hook the Horizon", href: "https://hookthehorizon.blog" },
  { label: "Elsewhere, Apparently", href: "https://the-money-apparently.vercel.app" },
];

function Out({ item }: { item: Item }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener"
      className="tap inline-flex items-center text-ink-foreground/70 transition-colors hover:text-ink-foreground"
    >
      {item.label}
    </a>
  );
}

export function LabsFooter() {
  return (
    <footer className="no-print mt-24 bg-ink text-ink-foreground">
      {/* House-gold hairline — the one house-level mark on the page. */}
      <div aria-hidden className="h-px w-full bg-house-gold" />
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="font-display text-2xl tracking-tight sm:text-3xl">
          Northern Lantern House Labs
        </h2>

        <div className="mt-10 grid gap-10 text-[13px] leading-relaxed sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-eyebrow text-ink-foreground/50">The House</p>
            <p className="mt-3 max-w-xs text-ink-foreground/70">
              Independent publications and the decision instruments built for them.
            </p>
            <p className="mt-3">
              <Out item={HOUSE} />
            </p>
          </div>

          <div>
            <p className="text-eyebrow text-ink-foreground/50">This publication</p>
            <ul className="mt-3 space-y-2">
              {PUBLICATION.map((i) => (
                <li key={i.href}>
                  <Out item={i} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-eyebrow text-ink-foreground/50">Across the fleet</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {FLEET.map((i) => (
                <li key={i.href}>
                  <Out item={i} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-foreground/15 pt-6 text-[12px] text-ink-foreground/55">
          <span>© 2026 Northern Lantern House</span>
          <span aria-hidden>·</span>
          <a
            href={`${HOUSE_URL}/legal-accessibility`}
            target="_blank"
            rel="noopener"
            className="tap transition-colors hover:text-ink-foreground"
          >
            Legal &amp; Accessibility
          </a>
          <span aria-hidden>·</span>
          <a
            href={`${HOUSE_URL}/support`}
            target="_blank"
            rel="noopener"
            className="tap transition-colors hover:text-ink-foreground"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
