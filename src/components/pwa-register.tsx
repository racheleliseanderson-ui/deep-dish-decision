import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";

const INSTALL_DISMISS_KEY = "deep-dish:pwa-install-dismissed";
/** Once an install card has been shown, the offline notice waits for another
 *  session. Two cards in the same corner in a row reads as nagging. */
const INSTALL_SHOWN_KEY = "deep-dish:pwa-install-shown";
/** The offline notice is information, not a decision. It leaves on its own. */
const OFFLINE_TOAST_MS = 7000;

/** Storage throws outright in some privacy modes. A prompt is never worth a
 *  blank page, so every read and write is best-effort. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1" || sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  // localStorage so "Not now" is remembered next visit, not re-asked every tab.
  try {
    localStorage.setItem(key, "1");
    return;
  } catch {
    /* fall through to the session-scoped copy */
  }
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* nothing persists here; the prompt simply returns next time */
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function PwaRegister() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [installShown, setInstallShown] = useState(true);
  const applyUpdate = useRef<(() => void) | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setDismissed(readFlag(INSTALL_DISMISS_KEY));
    setInstallShown(readFlag(INSTALL_SHOWN_KEY));
    setInstalled(isStandalone());

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    let waitingForRefresh = false;
    const onControllerChange = () => {
      if (waitingForRefresh) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    applyUpdate.current = () => {
      waitingForRefresh = true;
      void navigator.serviceWorker.getRegistration().then((registration) => {
        registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
      });
    };

    let updateTimer = 0;
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setNeedRefresh(true);
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state !== "installed") return;
          if (navigator.serviceWorker.controller) setNeedRefresh(true);
          else setOfflineReady(true);
        });
      });
      updateTimer = window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    });

    return () => {
      window.clearInterval(updateTimer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  // Nobody installs an instrument they have not used yet, and on the landing
  // page this card lands directly on top of the primary call to action. Wait
  // until the visitor has moved into the app and has something worth keeping.
  const engaged = pathname !== "/";
  const showInstall = engaged && Boolean(installEvent) && !dismissed && !installed && !needRefresh;
  const showOffline = offlineReady && !needRefresh && !showInstall && !installShown;

  useEffect(() => {
    if (!showInstall) return;
    writeFlag(INSTALL_SHOWN_KEY);
    setInstallShown(true);
  }, [showInstall]);

  useEffect(() => {
    if (!showOffline) return;
    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [showOffline]);

  if (!needRefresh && !showInstall && !showOffline) return null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] left-4 right-24 z-50 sm:inset-x-0 sm:bottom-0 sm:p-6">
      <div
        role="status"
        aria-live="polite"
        aria-labelledby="pwa-toast-title"
        className="plate pointer-events-auto w-full max-w-sm p-4"
      >
        {needRefresh ? (
          <>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-gilt-soft text-gilt">
                <RefreshCw className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p id="pwa-toast-title" className="font-display text-xl leading-tight">
                  A new working set is ready
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reload to take the updated instrument. Open records stay on this device.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => applyUpdate.current?.()}>Reload</Button>
              <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
                Later
              </Button>
            </div>
          </>
        ) : showInstall ? (
          <>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-gilt-soft text-gilt">
                <Download className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p id="pwa-toast-title" className="font-display text-xl leading-tight">
                  Keep Deep Dish on this device
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Install the app for a standalone night desk — records stay local.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  if (!installEvent) return;
                  await installEvent.prompt();
                  const choice = await installEvent.userChoice;
                  if (choice.outcome !== "accepted") {
                    writeFlag(INSTALL_DISMISS_KEY);
                    setDismissed(true);
                  }
                  setInstallEvent(null);
                }}
              >
                Install
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  writeFlag(INSTALL_DISMISS_KEY);
                  setDismissed(true);
                }}
              >
                Not now
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-full bg-verified-soft text-verified">
                <WifiOff className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p id="pwa-toast-title" className="font-display text-xl leading-tight">
                  Ready without a network
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The instrument will keep working offline. Dismiss whenever you like.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Button variant="ghost" onClick={() => setOfflineReady(false)}>
                Dismiss
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
