import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { respond, worthCaching } from "../../public/sw.js";

/**
 * What the till's worker actually serves.
 *
 * The caching *rule* is checked next door; this is the half that decides whether the cashier sees
 * the till or a browser error page after reloading with no connection — and whether what was
 * kept is the till at all.
 *
 * A stand-in `CacheStorage` rather than a browser: the behaviour worth pinning is ours, not the
 * Cache API's.
 */

/** Just enough of `CacheStorage` to watch what the worker puts in it and takes out. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    put: async (request: Request, response: Response) => {
      store.set(request.url, response);
    },
  };
  return {
    store,
    api: {
      open: async () => cache,
      match: async (request: Request, options?: { ignoreSearch?: boolean }) => {
        if (store.has(request.url)) return store.get(request.url);
        if (!options?.ignoreSearch) return undefined;
        const bare = request.url.split("?")[0];
        for (const [url, response] of store) if (url.split("?")[0] === bare) return response;
        return undefined;
      },
    } as unknown as CacheStorage,
  };
}

const TILL = "https://till.example/pos/register";
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

describe("what the till's worker serves", () => {
  it("keeps the page when it loads, and hands it back when the network is gone", async () => {
    const { api, store } = fakeCaches();
    const request = new Request(TILL);

    await respond("document", request, { caches: api, fetch: async () => new Response("<html>till</html>") });
    assert.equal(store.size, 1, "the page should have been kept");

    const offlineResponse = await respond("document", request, { caches: api, fetch: offline });
    assert.equal(await offlineResponse.text(), "<html>till</html>");
  });

  it("opens even when the reload carries the bill it had open", async () => {
    // A till reloaded on `?order=…` must still come up; which bill was open is not worth failing over.
    const { api } = fakeCaches();
    await respond("document", new Request(TILL), { caches: api, fetch: async () => new Response("<html>till</html>") });

    const response = await respond("document", new Request(`${TILL}?order=abc`), { caches: api, fetch: offline });
    assert.equal(await response.text(), "<html>till</html>");
  });

  it("never keeps a page it was redirected to, which is how a till ends up stuck on the sign-in screen", async () => {
    /**
     * The failure this exists for: an expired session redirects the register page to sign-in,
     * `fetch` follows it, and a perfectly good 200 comes back — for the wrong page. Stored under
     * the till's URL, every offline reload afterwards would open a form nobody can use.
     */
    const { api, store } = fakeCaches();
    const redirected = new Response("<html>sign in</html>", { status: 200 });
    Object.defineProperty(redirected, "redirected", { value: true });

    await respond("document", new Request(TILL), { caches: api, fetch: async () => redirected });
    assert.equal(store.size, 0);
  });

  it("never keeps a failed response", async () => {
    const { api, store } = fakeCaches();
    await respond("document", new Request(TILL), { caches: api, fetch: async () => new Response("nope", { status: 500 }) });
    assert.equal(store.size, 0);
  });

  it("fails like any other request when there is nothing kept to fall back on", async () => {
    // Better a browser error the cashier recognises than a blank screen we invented.
    const { api } = fakeCaches();
    await assert.rejects(respond("document", new Request(TILL), { caches: api, fetch: offline }));
  });

  it("serves a build file from the cache without asking the network at all", async () => {
    const { api } = fakeCaches();
    const asset = new Request("https://till.example/_next/static/chunks/main-abc.js");
    await respond("asset", asset, { caches: api, fetch: async () => new Response("v1") });

    let asked = false;
    const response = await respond("asset", asset, {
      caches: api,
      fetch: async () => {
        asked = true;
        return new Response("v2");
      },
    });
    assert.equal(asked, false, "a content-hashed file never needs checking again");
    assert.equal(await response.text(), "v1");
  });
});

describe("worthCaching", () => {
  it("accepts a plain success and nothing else", () => {
    assert.equal(worthCaching(new Response("ok")), true);
    assert.equal(worthCaching(new Response("no", { status: 404 })), false);
  });
});
