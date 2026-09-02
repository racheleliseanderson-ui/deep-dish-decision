import { useEffect, useState } from "react";

const KEY = "rih-shortlist";
const EVENT = "rih-shortlist-change";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(next: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — shortlist stays session-only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The night plan stays local to this browser. */
export function useShortlist() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setSlugs(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Every mutation reads through read() rather than the `slugs` render value.
  // Closing over state meant two calls in the same tick both computed from the
  // same stale array and the second silently discarded the first — reordering
  // twice quickly, or adding two rooms from one handler, lost one.
  return {
    slugs,
    has: (slug: string) => slugs.includes(slug),
    toggle: (slug: string) => {
      const current = read();
      write(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
    },
    remove: (slug: string) => write(read().filter((s) => s !== slug)),
    clear: () => write([]),
    makePrimary: (slug: string) => {
      const current = read();
      if (!current.includes(slug)) return;
      write([slug, ...current.filter((item) => item !== slug)]);
    },
    move: (slug: string, dir: -1 | 1) => {
      const current = read();
      const i = current.indexOf(slug);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= current.length) return;
      const next = [...current];
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      write(next);
    },
  };
}
