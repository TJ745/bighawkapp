/**
 * The till's service worker: what makes a **cold start** offline possible.
 *
 * The sale queue already lets a cashier keep selling through an outage, but only while the page
 * stays open — reload the browser with no connection and the browser has no HTML to render. This
 * worker keeps the last good copy of the register page and the build's static files, so the till
 * comes back up on a dead network and the queue takes over from there.
 *
 * A **module** worker (`register(..., { type: "module" })`), so the rule below is a real export
 * and `cache-policy.test.ts` can load and check it. The worker half is guarded, so importing this
 * file in Node runs nothing.
 *
 * Hand-written rather than generated: the whole point is that a person can read what is cached
 * and, more importantly, what never is.
 */

/** Bumped to retire every old cache at once; `activate` deletes anything that does not match. */
export const VERSION = "bighawk-till-v1";
const DOCUMENT_CACHE = `${VERSION}-documents`;
const ASSET_CACHE = `${VERSION}-assets`;

/**
 * The only pages kept for offline use.
 *
 * Deliberately just the till. Every other screen reads live data that would be wrong or
 * misleading from yesterday's copy — a stock list, a shift summary, a report — and a page that
 * silently shows stale figures is worse than one that says it needs a connection.
 */
export const OFFLINE_ROUTES = ["/pos/register"];

/**
 * @typedef {"asset" | "document" | "pass"} CachePolicy
 */

/**
 * What this worker should do with one request.
 *
 * Pure, and the part worth being sure about: every mistake here is silent. Caching a Server
 * Action would let a sale be served from a cache and never reach the server; caching an RSC
 * payload would hand the router a stale tree it cannot tell is stale; caching an authenticated
 * document for too wide a set of routes leaves other people's data on a shared till.
 *
 * @param {{ method: string, url: string, origin: string, mode: string, isRscRequest: boolean }} request
 * @returns {CachePolicy}
 */
export function cachePolicyFor(request) {
  // Anything that changes something on the server. A Server Action is a POST, and a cached or
  // replayed one would invent money.
  if (request.method !== "GET") return "pass";

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return "pass";
  }
  if (url.origin !== request.origin) return "pass";

  // The build's own files are content-hashed, so a cached copy can never be the wrong version.
  if (url.pathname.startsWith("/_next/static/")) return "asset";

  // Auth, uploads, and anything else behind /api stays on the network, always.
  if (url.pathname.startsWith("/api/")) return "pass";

  /**
   * The client router's data fetches. Serving one from a cache would show the cashier a tree
   * from the last visit with nothing to say so — the opposite of a reload, which at least
   * announces itself.
   */
  if (request.isRscRequest || url.searchParams.has("_rsc")) return "pass";

  if (request.mode === "navigate" && OFFLINE_ROUTES.includes(url.pathname)) return "document";

  return "pass";
}

/** True only inside a real service worker; in Node this file is just its exports. */
const inServiceWorker = typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope;

if (inServiceWorker) {
  self.addEventListener("install", () => {
    // The till's own page is fetched on activation instead (see below); the build's chunks are
    // picked up as it asks for them. Taking over straight away is what matters here.
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name)));
        await self.clients.claim();
        await warmCache();
      })(),
    );
  });

  self.addEventListener("fetch", (event) => {
    const policy = cachePolicyFor({
      method: event.request.method,
      url: event.request.url,
      origin: self.location.origin,
      mode: event.request.mode,
      isRscRequest: event.request.headers.get("RSC") === "1" || event.request.headers.has("Next-Router-Prefetch"),
    });
    // Not calling respondWith leaves the request entirely alone, which is what "pass" means.
    if (policy === "pass") return;
    event.respondWith(respond(policy, event.request, { caches, fetch: (input) => fetch(input) }));
  });

  /**
   * Clears everything this worker has kept.
   *
   * Sent on sign-out: the cached register page holds whatever the last cashier could see, and a
   * till is a shared device. The queue of unsent sales is **not** touched — that is money, it
   * lives in IndexedDB, and it belongs to the shop rather than to whoever was signed in.
   */
  self.addEventListener("message", (event) => {
    if (event.data?.type !== "bighawk:clear") return;
    event.waitUntil(caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))));
  });
}

/**
 * Fetches the till's page now, rather than waiting for somebody to reload it.
 *
 * The page that *registers* the worker was already fetched before the worker existed, so it can
 * never be cached — which meant a till opened once and left open was never saved, and the first
 * anyone knew was a browser error page during an outage. Asking for it here makes one visit
 * enough.
 *
 * Same-origin `fetch` carries the session cookie, so this gets the real page. If nobody is signed
 * in it follows a redirect to the sign-in screen instead, and `worthCaching` refuses it — which
 * is exactly right: a cached sign-in form would be worse than nothing.
 *
 * Failures are swallowed. This is an optimisation on top of network-first caching, and a till
 * that cannot reach the server right now must still install its worker.
 */
async function warmCache() {
  const cache = await caches.open(DOCUMENT_CACHE);
  await Promise.all(
    OFFLINE_ROUTES.map(async (route) => {
      try {
        const request = new Request(new URL(route, self.location.origin), { credentials: "same-origin" });
        const response = await fetch(request);
        if (worthCaching(response)) await cache.put(request, response.clone());
      } catch {
        // No connection, or the server said no. Either way there is nothing to keep.
      }
    }),
  );
}

/**
 * Whether a response is worth keeping.
 *
 * `redirected` is the one that matters and the one that is easy to miss. When a session has
 * expired the register page redirects to the sign-in screen, `fetch` follows it, and what comes
 * back is a perfectly good **200 — for the wrong page**. Storing that under the till's URL would
 * mean every offline reload from then on opened a sign-in form the cashier could not use.
 *
 * @param {Response} response
 */
export function worthCaching(response) {
  return response.ok && !response.redirected;
}

/**
 * Serves one request under a policy.
 *
 * Takes its `caches` and `fetch` rather than reaching for the globals, so the behaviour that
 * matters — what is kept, and what is served when the network is gone — can be checked without a
 * browser. The worker passes the real ones.
 *
 * @param {"asset" | "document"} policy
 * @param {Request} request
 * @param {{ caches: CacheStorage, fetch: (request: Request) => Promise<Response> }} deps
 */
export async function respond(policy, request, deps) {
  if (policy === "asset") {
    // Hashed build files: a cached copy is always the right one, so never wait for the network.
    const cached = await deps.caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    const response = await deps.fetch(request);
    if (worthCaching(response)) {
      const cache = await deps.caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }

  /**
   * The register page: the live one whenever there is a network, the last good one when there is
   * not. Network-first and not the other way round, because a cashier with a connection must see
   * today's catalogue; the cached copy exists for the reload that would otherwise show a browser
   * error page.
   */
  try {
    const response = await deps.fetch(request);
    if (worthCaching(response)) {
      const cache = await deps.caches.open(DOCUMENT_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    /**
     * `ignoreSearch`, so a till reloaded on `?order=…` still opens: the saved page is the till
     * itself, and which bill it had open is not worth failing over.
     *
     * `ignoreVary` because Next sends `Vary: RSC, Next-Router-State-Tree, …` on its HTML. A
     * single differing header between the request that stored the page and the one asking for it
     * would otherwise make the cached copy invisible — a cache that holds the page and refuses
     * to hand it over, which looks exactly like an empty one.
     */
    const cached = await deps.caches.match(request, { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}
