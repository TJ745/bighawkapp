import type { NextConfig } from "next";
import { SERVER_ACTION_BODY_LIMIT } from "./lib/storage/limits";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Uploads go through Server Actions, whose request body is capped at 1 MB by default —
    // small enough to reject documents well under our own 10 MB limit.
    serverActions: { bodySizeLimit: SERVER_ACTION_BODY_LIMIT },
  },
};

export default nextConfig;
