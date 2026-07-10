/* Ramree service worker — minimal, network-first.
   Its main job is to make the app installable (Add to Home Screen). It does a
   light offline fallback but always prefers the network so users never get
   stale JS/CSS after a deploy. */
const CACHE = "ramree-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API or media — always live.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
