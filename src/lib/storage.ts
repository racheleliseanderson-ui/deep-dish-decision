import type { ConfirmationPass, SavedNight, Situation } from "@/lib/types";
import { emptySituation } from "@/lib/types";
import { uid } from "@/lib/utils";

const NIGHTS_KEY = "deepdish.nights.v1";
const PASSES_KEY = "deepdish.passes.v1";
const ACTIVE_KEY = "deepdish.activeNight.v1";
const EVENTS_KEY = "deepdish.events.v1";
const THEME_KEY = "deepdish.theme.v1";
const CVD_KEY = "deepdish.cvd.v1";
const CORRECTIONS_KEY = "deepdish.corrections.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // privacy / quota — fail closed to memory
  }
}

export function loadNights(): SavedNight[] {
  return read<SavedNight[]>(NIGHTS_KEY, []);
}

export function saveNights(nights: SavedNight[]) {
  write(NIGHTS_KEY, nights);
}

export function upsertNight(night: SavedNight): SavedNight[] {
  const all = loadNights();
  const i = all.findIndex((n) => n.id === night.id);
  const next = { ...night, updatedAt: new Date().toISOString() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  saveNights(all);
  write(ACTIVE_KEY, next.id);
  return all;
}

export function newNight(situation: Situation = emptySituation, name?: string): SavedNight {
  const now = new Date().toISOString();
  const night: SavedNight = {
    id: uid("night"),
    name: name ?? (situation.occasion ? situation.occasion : "Untitled night"),
    createdAt: now,
    updatedAt: now,
    situation,
    shortlist: [],
    compare: [],
    pinned: false,
  };
  upsertNight(night);
  return night;
}

export function activeNightId(): string | null {
  return read<string | null>(ACTIVE_KEY, null);
}

export function loadPasses(): ConfirmationPass[] {
  return read<ConfirmationPass[]>(PASSES_KEY, []);
}

export function savePasses(passes: ConfirmationPass[]) {
  write(PASSES_KEY, passes);
}

export function upsertPass(pass: ConfirmationPass): ConfirmationPass[] {
  const all = loadPasses();
  const i = all.findIndex((p) => p.id === pass.id);
  const next = { ...pass, updatedAt: new Date().toISOString() };
  if (i >= 0) all[i] = next;
  else all.unshift(next);
  savePasses(all);
  return all;
}

export function passById(id: string): ConfirmationPass | undefined {
  return loadPasses().find((p) => p.id === id);
}

export type ProductEvent = {
  at: string;
  name: string;
  meta?: Record<string, string | number | boolean | null>;
};

export function track(name: string, meta?: ProductEvent["meta"]) {
  const events = read<ProductEvent[]>(EVENTS_KEY, []);
  events.push({ at: new Date().toISOString(), name, meta });
  write(EVENTS_KEY, events.slice(-200));
}

export function loadEvents(): ProductEvent[] {
  return read<ProductEvent[]>(EVENTS_KEY, []);
}

export function loadTheme(): "navy" | "pearl" {
  return read<"navy" | "pearl">(THEME_KEY, "navy");
}

export function saveTheme(theme: "navy" | "pearl") {
  write(THEME_KEY, theme);
}

export function loadCvd(): boolean {
  return read<boolean>(CVD_KEY, false);
}

export function saveCvd(on: boolean) {
  write(CVD_KEY, on);
}

export function duplicateNight(night: SavedNight): SavedNight {
  const copy = newNight(night.situation, `${night.name} (copy)`);
  copy.shortlist = [...night.shortlist];
  copy.compare = [...night.compare];
  upsertNight(copy);
  return copy;
}

export type CorrectionNote = {
  id: string;
  slug: string;
  at: string;
  note: string;
};

export function saveCorrection(slug: string, note: string): CorrectionNote[] {
  const all = read<CorrectionNote[]>(CORRECTIONS_KEY, []);
  all.unshift({ id: uid("note"), slug, at: new Date().toISOString(), note });
  write(CORRECTIONS_KEY, all.slice(0, 100));
  track("feedback", { slug });
  return all.filter((n) => n.slug === slug);
}

export function correctionsFor(slug: string): CorrectionNote[] {
  return read<CorrectionNote[]>(CORRECTIONS_KEY, []).filter((n) => n.slug === slug);
}
