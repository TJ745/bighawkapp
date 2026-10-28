/**
 * Registering (and clearing) the till's service worker.
 *
 * Client-only. Kept apart from the component so sign-out can clear the cache without importing
 * anything from the till.
 */

/** Why the till cannot be made to work offline, or null when it can. */
export type OfflineReadiness = "ready" | "registering" | "unsupported" | "development";

const SCRIPT = "/sw.js";

export function serviceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Installs the worker, once.
 *
 * **Not in development.** The dev server rebuilds chunks on every change, so a cached dev
 * document points at files that no longer exist — the till would come back up broken and the
 * cause would look like anything but the cache. Offline cold start is a production promise, and
 * the Next docs say the same about testing it.
 */
export async function registerTillWorker(): Promise<OfflineReadiness> {
  if (process.env.NODE_ENV !== "production") return "development";
  if (!serviceWorkerSupported()) return "unsupported";
  try {
    // A module worker, so the caching rule can be exported and tested rather than copied.
    await navigator.serviceWorker.register(SCRIPT, { type: "module", scope: "/" });
    await navigator.serviceWorker.ready;
    return "ready";
  } catch {
    // An old browser without module workers, or a device that refuses registration. The till
    // still sells through an outage; it just cannot be reopened during one.
    return "unsupported";
  }
}

/**
 * Throws away every cached page and file.
 *
 * Called on sign-out: a till is a shared device and the cached register page holds whatever the
 * last cashier could see. Queued sales are left alone — that is money, and it belongs to the shop
 * rather than to whoever was signed in.
 */
export async function clearTillCache(): Promise<void> {
  if (!serviceWorkerSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: "bighawk:clear" });
    // Also cleared directly, because a worker that is not yet active would never get the message.
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // Nothing to clear, or a browser that will not say. Either way there is nothing to report.
  }
}
