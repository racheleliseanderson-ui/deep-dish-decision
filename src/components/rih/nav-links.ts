/**
 * The app's navigation, and the only source of truth for it.
 *
 * The header stays at four items: it is a single row on desktop and a
 * disclosure sheet below `md`, and a fifth item pushes the display pill into
 * the wordmark. /console is a research surface, so it lives in the footer,
 * which is how it becomes reachable at all: its only previous link was an
 * orphaned site-nav.tsx that nothing rendered, now deleted.
 */
export const HEADER_NAV_LINKS = [
  { to: "/", key: "nav.instrument" },
  { to: "/shortlist", key: "nav.shortlist" },
  { to: "/guide", key: "nav.guide" },
  { to: "/atlas", key: "nav.atlas" },
] as const;

/** Everything in the header, plus the research surfaces it has no room for. */
export const FOOTER_NAV_LINKS = [
  ...HEADER_NAV_LINKS,
  { to: "/console", key: "nav.console" },
] as const;
