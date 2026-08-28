import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";
import appCss from "../styles.css?url";

const APP_NAME = "Deep Dish";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#152038" },
      { property: "og:url", content: "https://deepdish.saltnotes.blog/" },
      {
        name: "description",
        content:
          "Rank a restaurant against the night you actually have, then complete a confirmation pass before you book. First-party evidence. Unknowns stay open.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "canonical", href: "https://deepdish.saltnotes.blog/" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "manifest", href: "/__app/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__app/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Work+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="dark antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </AuthProvider>
        <PwaRegister />
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-eyebrow">Missing file</p>
      <h1 className="mt-3 font-display text-4xl">This page is not in the working set.</h1>
      <p className="mt-3 text-muted-foreground">The instrument will not invent a room to fill the gap.</p>
      <a href="/" className="mt-6 inline-flex text-primary">
        Back to start
      </a>
    </main>
  ),
});
