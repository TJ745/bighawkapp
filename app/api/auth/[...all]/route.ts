import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

// BetterAuth requires an HTTP handler; this is the only place auth is exposed over HTTP.
export const { GET, POST } = toNextJsHandler(auth);
