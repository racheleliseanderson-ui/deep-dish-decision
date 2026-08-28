import { create } from "zustand";
import { emptySituation, type ConfirmationPass, type SavedNight, type Situation } from "@/lib/types";
import {
  activeNightId,
  loadCvd,
  loadNights,
  loadPasses,
  loadTheme,
  newNight,
  saveCvd,
  saveTheme,
  track,
  upsertNight,
  upsertPass,
} from "@/lib/storage";

type NightStore = {
  hydrated: boolean;
  theme: "navy" | "pearl";
  cvd: boolean;
  nights: SavedNight[];
  passes: ConfirmationPass[];
  activeId: string | null;
  hydrate: () => void;
  situation: () => Situation;
  setSituation: (s: Situation | ((prev: Situation) => Situation)) => void;
  setTheme: (t: "navy" | "pearl") => void;
  setCvd: (on: boolean) => void;
  startNight: (s?: Situation, name?: string) => SavedNight;
  toggleShortlist: (slug: string) => void;
  toggleCompare: (slug: string) => void;
  savePass: (pass: ConfirmationPass) => void;
  renameNight: (id: string, name: string) => void;
  pinNight: (id: string) => void;
  setActive: (id: string) => void;
  reload: () => void;
};

function current(nights: SavedNight[], id: string | null): SavedNight | undefined {
  return nights.find((n) => n.id === id) ?? nights[0];
}

export const useNight = create<NightStore>((set, get) => ({
  hydrated: false,
  theme: "navy",
  cvd: false,
  nights: [],
  passes: [],
  activeId: null,
  hydrate: () => {
    if (get().hydrated) return;
    const nights = loadNights();
    const passes = loadPasses();
    const theme = loadTheme();
    const cvd = loadCvd();
    const activeId = activeNightId() ?? nights[0]?.id ?? null;
    set({ hydrated: true, nights, passes, theme, cvd, activeId });
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "navy");
      document.documentElement.classList.toggle("cvd", cvd);
    }
  },
  situation: () => current(get().nights, get().activeId)?.situation ?? emptySituation,
  setSituation: (s) => {
    const st = get();
    let night = current(st.nights, st.activeId);
    if (!night) {
      night = newNight(emptySituation);
    }
    const nextSit = typeof s === "function" ? s(night.situation) : s;
    const next = { ...night, situation: nextSit };
    const nights = upsertNight(next);
    set({ nights, activeId: next.id });
  },
  setTheme: (t) => {
    saveTheme(t);
    set({ theme: t });
    document.documentElement.classList.toggle("dark", t === "navy");
  },
  setCvd: (on) => {
    saveCvd(on);
    set({ cvd: on });
    document.documentElement.classList.toggle("cvd", on);
  },
  startNight: (s = emptySituation, name) => {
    const night = newNight(s, name);
    track("workflow_started", { occasion: s.occasion ?? "" });
    set({ nights: loadNights(), activeId: night.id });
    return night;
  },
  toggleShortlist: (slug) => {
    const st = get();
    const night = current(st.nights, st.activeId);
    if (!night) return;
    const shortlist = night.shortlist.includes(slug)
      ? night.shortlist.filter((x) => x !== slug)
      : [...night.shortlist, slug];
    const nights = upsertNight({ ...night, shortlist });
    set({ nights });
  },
  toggleCompare: (slug) => {
    const st = get();
    const night = current(st.nights, st.activeId);
    if (!night) return;
    let compare = night.compare.includes(slug)
      ? night.compare.filter((x) => x !== slug)
      : [...night.compare, slug];
    if (compare.length > 3) compare = compare.slice(-3);
    set({ nights: upsertNight({ ...night, compare }) });
  },
  savePass: (pass) => {
    upsertPass(pass);
    set({ passes: loadPasses() });
    track("pass_saved", { slug: pass.slug, status: pass.status });
  },
  renameNight: (id, name) => {
    const night = get().nights.find((n) => n.id === id);
    if (!night) return;
    set({ nights: upsertNight({ ...night, name }) });
  },
  pinNight: (id) => {
    const night = get().nights.find((n) => n.id === id);
    if (!night) return;
    set({ nights: upsertNight({ ...night, pinned: !night.pinned }) });
  },
  setActive: (id) => {
    const nights = get().nights;
    if (!nights.some((n) => n.id === id)) return;
    upsertNight(nights.find((n) => n.id === id)!);
    set({ activeId: id });
  },
  reload: () => {
    set({ nights: loadNights(), passes: loadPasses() });
  },
}));
