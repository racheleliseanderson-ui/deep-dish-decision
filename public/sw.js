/*
 * Temporary PWA decommission worker.
 *
 * PR #23 briefly registered /sw.js with a 24-hour navigation cache. This worker exists only
 * to replace that obsolete worker, remove the caches it created, unregister the registration,
 * and reload any open Deep Dish windows onto the recovered non-PWA application.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key === "pages" || key === "images" || key.startsWith("workbox-precache"),
          )
          .map((key) => caches.delete(key)),
      );

      await self.registration.unregister();

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.all(
        windows.map((client) => (typeof client.navigate === "function" ? client.navigate(client.url) : null)),
      );
    })(),
  );
});
