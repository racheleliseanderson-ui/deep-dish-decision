/**
 * Where you are asking from.
 *
 * Three ways to establish an origin, in descending order of precision:
 *   1. the browser's geolocation, with the user's permission
 *   2. a city picked from the corpus
 *   3. nothing — in which case distance is simply not shown
 *
 * The origin is never assumed and never persisted without consent. It lives in
 * localStorage so a returning visitor does not have to re-grant, and it travels
 * in the URL only as a coarse city so a shared link never leaks a home address.
 */
import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/lib/live";

export type Origin =
  | { kind: "device"; ll: LatLng; accuracyMi: number | null; label: string }
  | { kind: "city"; ll: LatLng; label: string }
  | null;

export type OriginState = {
  origin: Origin;
  status: "idle" | "asking" | "granted" | "denied" | "unavailable";
  request: () => void;
  setCity: (label: string, ll: LatLng) => void;
  clear: () => void;
};

const KEY = "rih-origin";

function read(): Origin {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Origin;
    if (!parsed || !Array.isArray(parsed.ll) || parsed.ll.length !== 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(origin: Origin) {
  try {
    if (origin) localStorage.setItem(KEY, JSON.stringify(origin));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — session-only origin */
  }
}

export function useOrigin(): OriginState {
  const [origin, setOrigin] = useState<Origin>(null);
  const [status, setStatus] = useState<OriginState["status"]>("idle");

  useEffect(() => {
    const stored = read();
    if (stored) {
      setOrigin(stored);
      setStatus(stored.kind === "device" ? "granted" : "idle");
    }
    if (typeof navigator !== "undefined" && !("geolocation" in navigator)) {
      setStatus((s) => (s === "idle" ? "unavailable" : s));
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: Origin = {
          kind: "device",
          ll: [pos.coords.latitude, pos.coords.longitude],
          accuracyMi: pos.coords.accuracy ? pos.coords.accuracy / 1609.34 : null,
          label: "Your location",
        };
        setOrigin(next);
        write(next);
        setStatus("granted");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  const setCity = useCallback((label: string, ll: LatLng) => {
    const next: Origin = { kind: "city", ll, label };
    setOrigin(next);
    write(next);
    setStatus("idle");
  }, []);

  const clear = useCallback(() => {
    setOrigin(null);
    write(null);
    setStatus("idle");
  }, []);

  return { origin, status, request, setCity, clear };
}
