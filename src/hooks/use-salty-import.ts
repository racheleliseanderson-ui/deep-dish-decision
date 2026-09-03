import { useCallback, useEffect, useState } from "react";

import { clearHandoffFromUrl, readHandoffFromLocation } from "@/lib/salty-handoff/codec.ts";
import type { SaltyApp } from "@/lib/salty-handoff/contract.ts";
import {
  IDLE,
  applyImport,
  beginImport,
  dismissImport,
  type ImportSession,
} from "@/lib/salty-handoff/import-session.ts";

export function useSaltyImport(destination: SaltyApp, hasExistingWork: boolean, ready = true) {
  const [session, setSession] = useState<ImportSession>(IDLE);

  useEffect(() => {
    if (!ready) return;
    const result = readHandoffFromLocation(destination);
    setSession(beginImport(result, hasExistingWork));
  }, [destination, hasExistingWork, ready]);

  const apply = useCallback(() => {
    setSession((current) => applyImport(current));
    clearHandoffFromUrl();
  }, []);

  const ignore = useCallback(() => {
    setSession((current) => dismissImport(current));
    clearHandoffFromUrl();
  }, []);

  return { session, apply, ignore };
}
