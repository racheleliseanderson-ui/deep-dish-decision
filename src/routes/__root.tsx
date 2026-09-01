import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { HouseBar } from "@/components/rih/house-bar";
import { LabsFooter } from "@/components/rih/labs-footer";
import { NightPlanBar } from "@/components/rih/night-plan-bar";
import { SuiteStrip } from "@/components/rih/suite-strip";
import { SupportFooter } from "@/components/SupportFooter";

const ADSENSE_CLIENT = "ca-pub-8542391068454821";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google-adsense-account", content: ADSENSE_CLIENT },
      { title: "Restaurant Intelligence Hub — evidence-led restaurant decisions" },
      {
        name: "description",
        content:
          "First-party restaurant evidence, ranked against your situation: why go, what to order, what it costs, and what you still need to confirm.",
      },
      { property: "og:title", content: "Restaurant Intelligence Hub" },
      {
        property: "og:description",
        content: "Why eat here — then confirm it. Evidence-led restaurant decisions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://deepdish.saltnotes.blog/og.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Dining room — Restaurant Intelligence Hub" },
      { property: "og:url", content: "https://deepdish.saltnotes.blog/" },
      { name: "twitter:image", content: "https://deepdish.saltnotes.blog/og.jpg" },
      { name: "theme-color", content: "#0c1220" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Work+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
    scripts: import.meta.env.PROD
      ? [
          {
            async: true,
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`,
            crossOrigin: "anonymous",
          },
        ]
      : [],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const themeInit = `(function(){try{var d=document.documentElement;var m=localStorage.getItem("sc-mode")||localStorage.getItem("rih-theme");var cvd=localStorage.getItem("sc-cvd")==="on"||localStorage.getItem("rih-contrast")==="cvd"||m==="colorblind";if(m==="pearl"||m==="light"){d.classList.remove("dark");d.classList.add("light")}else{d.classList.add("dark");d.classList.remove("light")}if(cvd){d.classList.add("cvd");d.classList.add("mode-cvd")}d.lang="en"}catch(e){document.documentElement.classList.add("dark")}})()`;

// PR #23 briefly shipped a PWA at this origin. Its NetworkFirst navigation cache can keep
// serving that displaced application after rollback. Remove that registration and only the
// cache names created by that build; reload once when an old worker was controlling the page.
const stalePwaCleanup = `(function(){try{if(!("serviceWorker" in navigator))return;var reloadKey="rih-stale-pwa-cleanup-2026-08-28";var controlled=!!navigator.serviceWorker.controller;var unregister=navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(reg){return reg.unregister()}))}).catch(function(){});var clearCaches=Promise.resolve();if("caches" in window){clearCaches=caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key==="pages"||key==="images"||key.indexOf("workbox-precache")===0}).map(function(key){return caches.delete(key)}))}).catch(function(){})}Promise.all([unregister,clearCaches]).then(function(){if(controlled&&sessionStorage.getItem(reloadKey)!=="1"){sessionStorage.setItem(reloadKey,"1");window.location.reload()}}).catch(function(){})}catch(e){}})()`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: stalePwaCleanup }} />
      </head>
      <body>
        {children}
        <SupportFooter />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HouseBar className="border-b border-border" />
      <SuiteStrip current="restaurant" />
      <Outlet />
      <NightPlanBar />
      <LabsFooter />
    </QueryClientProvider>
  );
}
