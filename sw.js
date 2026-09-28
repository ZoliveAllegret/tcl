const CACHE = "tcl-shell-v6";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.destination === "script" || request.destination === "style" || request.destination === "image" || request.destination === "font") {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    const shell = await appShell(cache);
    return shell || response;
  } catch {
    return (await cache.match(request)) || (await appShell(cache)) || Response.error();
  }
}

async function appShell(cache) {
  const home = new Request(new URL("./index.html", self.registration.scope));
  const cached = await cache.match(home);
  const response = cached || (await fetch(home));
  if (!response.ok) {
    return null;
  }
  if (!cached) {
    await cache.put(home, response.clone());
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(await response.arrayBuffer(), { status: 200, headers });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
