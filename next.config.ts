import type { NextConfig } from "next";
import { SERVER_ACTION_BODY_LIMIT } from "./lib/storage/limits";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Uploads go through Server Actions, whose request body is capped at 1 MB by default —
    // small enough to reject documents well under our own 10 MB limit.
    serverActions: { bodySizeLimit: SERVER_ACTION_BODY_LIMIT },
    /**
     * `useOffline` is deliberately **off**, and this note is here so it is not switched on by
     * someone reading the Next guide on offline support.
     *
     * It makes a failed Server Action hang and retry instead of rejecting — and the till's
     * offline queue works precisely by catching that rejection. With it on, `completeSale` would
     * sit pending forever during an outage, nothing would reach the queue, and the cashier would
     * watch a frozen button instead of carrying on selling. It also does not do what this app
     * needed: it says itself that a full reload offline still fails. That is the service worker's
     * job, and it is done in `public/sw.js`.
     */
  },
  async headers() {
    return [
      {
        // The worker must never be served from the HTTP cache, or a till can be left running an
        // old caching rule long after the app has moved on. Next's own PWA guide says the same.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
