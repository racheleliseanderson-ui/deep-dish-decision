import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";

const INSTALL_DISMISS_KEY = "deep-dish:pwa-install-dismissed";

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
  const applyUpdate = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(INSTALL_DISMISS_KEY) === "1");
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

  const showInstall = Boolean(installEvent) && !dismissed && !installed && !needRefresh;
  const showOffline = offlineReady && !needRefresh && !showInstall;
  if (!needRefresh && !showInstall && !showOffline) return null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] left-4 right-24 z-50 sm:inset-x-0 sm:bottom-0 sm:p-6">
      <div
        role={needRefresh ? "alertdialog" : "status"}
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
                    sessionStorage.setItem(INSTALL_DISMISS_KEY, "1");
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
                  sessionStorage.setItem(INSTALL_DISMISS_KEY, "1");
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
