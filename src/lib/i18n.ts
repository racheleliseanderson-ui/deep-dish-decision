import { useLocale, type Locale } from "@/lib/prefs";

/**
 * Interface language for the chrome and the guidance copy. Record evidence is
 * never translated — a restaurant's own words stay in the language it published
 * them in, so nothing is silently paraphrased.
 */

type Dict = Record<string, string>;

const EN: Dict = {
  "nav.brand": "Salty & Clever",
  "nav.instrument": "Instrument",
  "nav.atlas": "Atlas",
  "nav.guide": "How to choose",
  "nav.console": "Coverage",
  "nav.shortlist": "Night plan",
  "nav.sections": "Sections",
  "prefs.reading": "Reading mode",
  "prefs.paper": "Paper",
  "prefs.instrument": "Instrument",
  "prefs.contrast": "Contrast",
  "prefs.colour": "Colour",
  "prefs.mono": "Mono",
  "prefs.cvd": "Safe",
  "prefs.language": "Language",
  "search.label": "Search records, cities, signals",
  "search.clear": "Clear search",
  "evidence.note": "Evidence is shown in the language the restaurant published it in.",
};

const ES: Dict = {
  "nav.brand": "Salty & Clever",
  "nav.instrument": "Instrumento",
  "nav.atlas": "Atlas",
  "nav.guide": "Cómo elegir",
  "nav.console": "Cobertura",
  "nav.shortlist": "Plan de noche",
  "nav.sections": "Secciones",
  "prefs.reading": "Modo de lectura",
  "prefs.paper": "Papel",
  "prefs.instrument": "Instrumento",
  "prefs.contrast": "Contraste",
  "prefs.colour": "Color",
  "prefs.mono": "Mono",
  "prefs.cvd": "Seguro",
  "prefs.language": "Idioma",
  "search.label": "Buscar registros, ciudades, señales",
  "search.clear": "Borrar búsqueda",
  "evidence.note": "La evidencia se muestra en el idioma en que el restaurante la publicó.",
};

const DICTS: Record<Locale, Dict> = { en: EN, es: ES };

export function useT() {
  const { locale, set } = useLocale();
  const dict = DICTS[locale] ?? EN;
  return {
    locale,
    setLocale: set,
    t: (key: string) => dict[key] ?? EN[key] ?? key,
  };
}
