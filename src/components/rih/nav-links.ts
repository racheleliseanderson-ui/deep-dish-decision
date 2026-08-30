/** Single source of truth for the app nav — max six items per the shell standard. */
export const NAV_LINKS = [
  { to: "/", key: "nav.instrument" },
  { to: "/guide", key: "nav.guide" },
  { to: "/atlas", key: "nav.atlas" },
  { to: "/console", key: "nav.console" },
  { to: "/shortlist", key: "nav.shortlist" },
] as const;
