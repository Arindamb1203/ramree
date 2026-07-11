/* Ramree service worker.
   Strategy:
   - API + media: always network (never cached here — data/images must be live).
   - Static app shell (HTML/CSS/JS/fonts): STALE-WHILE-REVALIDATE. Serve the
     cached copy instantly (no network wait → no load lag on repeat visits) while
     fetching a fresh copy in the background for next time. First-ever visit falls
     through to the network. This is what makes the app feel instant after the
     first load. */
const CACHE = "ramree-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never intercept API or media — always straight to the network for live data.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  // Same-origin app shell + cross-origin fonts → stale-while-revalidate.
  const isFont = url.hostname.includes("fonts.g");
  if (url.origin !== self.location.origin && !isFont) return;

  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);            // offline → whatever we have
        // Serve cache immediately if present; otherwise wait for the network.
        return cached || network;
      })
    )
  );
});
