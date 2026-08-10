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

/**
 * The shortlist is deliberately local to the reader's browser: nothing about a
 * night out is sent anywhere, and no record is altered by being shortlisted.
 */
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

  return {
    slugs,
    has: (slug: string) => slugs.includes(slug),
    toggle: (slug: string) =>
      write(slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [...slugs, slug]),
    remove: (slug: string) => write(slugs.filter((s) => s !== slug)),
    clear: () => write([]),
    move: (slug: string, dir: -1 | 1) => {
      const i = slugs.indexOf(slug);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= slugs.length) return;
      const next = [...slugs];
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      write(next);
    },
  };
}
