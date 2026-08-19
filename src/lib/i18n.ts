/**
 * Interface chrome copy. Record evidence is never translated — a restaurant's
 * own words stay in the language it published them in.
 * The instrument is English-only; there is no locale switcher.
 */

const EN: Record<string, string> = {
  "nav.brand": "Salty & Clever",
  "nav.instrument": "Instrument",
  "nav.atlas": "Atlas",
  "nav.guide": "How to choose",
  "nav.console": "Coverage",
  "nav.shortlist": "Night plan",
  "nav.sections": "Sections",
  "prefs.reading": "Appearance",
  "search.label": "Search records, cities, signals",
  "search.clear": "Clear search",
  "evidence.note": "Evidence is shown in the language the restaurant published it in.",
};

export function useT() {
  return {
    locale: "en" as const,
    setLocale: (_next: "en") => {},
    t: (key: string) => EN[key] ?? key,
  };
}
