import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OFFLINE_ROUTES, cachePolicyFor } from "../../public/sw.js";

/**
 * What the till's service worker is allowed to keep.
 *
 * Every mistake in this rule is silent, and two of them are serious: a cached Server Action
 * would let a sale be answered from a cache and never reach the server, and a cached page for
 * the wrong route would leave one person's data on a shared till. Nothing on screen would say so
 * — which is exactly why the rule is a pure function with tests rather than a few `if`s buried in
 * a `fetch` handler.
 *
 * Imported from `public/sw.js` itself, so what is tested is what ships.
 */

const ORIGIN = "https://till.example";

function policy(over: Partial<Parameters<typeof cachePolicyFor>[0]> & { url: string }) {
  return cachePolicyFor({ method: "GET", origin: ORIGIN, mode: "navigate", isRscRequest: false, ...over });
}

describe("what the till's worker caches", () => {
  it("keeps the register page, so it can be reopened with no connection", () => {
    assert.equal(policy({ url: `${ORIGIN}/pos/register` }), "document");
  });

  it("keeps the build's own files, which are content-hashed and so can never be the wrong version", () => {
    assert.equal(policy({ url: `${ORIGIN}/_next/static/chunks/main-abc123.js`, mode: "no-cors" }), "asset");
  });

  it("never touches anything that is not a GET", () => {
    // A Server Action is a POST. Answering one from a cache would invent money.
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal(policy({ url: `${ORIGIN}/pos/register`, method }), "pass", method);
    }
  });

  it("never touches another origin", () => {
    assert.equal(policy({ url: "https://somewhere.else/pos/register" }), "pass");
  });

  it("never touches the API, which is where signing in happens", () => {
    assert.equal(policy({ url: `${ORIGIN}/api/auth/get-session` }), "pass");
    assert.equal(policy({ url: `${ORIGIN}/api/files/logo.png`, mode: "no-cors" }), "pass");
  });

  it("never serves the router its own data from a cache", () => {
    /**
     * A reload at least announces itself. A soft navigation answered from a stale RSC payload
     * shows the cashier yesterday's screen with nothing to say so.
     */
    assert.equal(policy({ url: `${ORIGIN}/pos/register?_rsc=abc` }), "pass");
    assert.equal(policy({ url: `${ORIGIN}/pos/register`, isRscRequest: true }), "pass");
  });

  it("keeps only the till, not every page the cashier can open", () => {
    // Every other screen reads live figures that would mislead if shown from yesterday's copy.
    for (const path of ["/dashboard", "/pos/sales", "/pos/stock", "/finance", "/sales/invoices"]) {
      assert.equal(policy({ url: `${ORIGIN}${path}` }), "pass", path);
    }
  });

  it("only keeps a page that is actually being navigated to", () => {
    // A `fetch()` for the same URL is not a page load and must not fill the page cache.
    assert.equal(policy({ url: `${ORIGIN}/pos/register`, mode: "cors" }), "pass");
  });

  it("survives a URL it cannot parse instead of throwing inside the worker", () => {
    // A throw here would take out the fetch handler, and with it every request on the page.
    assert.equal(policy({ url: "not a url" }), "pass");
  });

  it("names the till and nothing else as offline-capable", () => {
    assert.deepEqual(OFFLINE_ROUTES, ["/pos/register"]);
  });
});
