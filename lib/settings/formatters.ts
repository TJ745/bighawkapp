import "server-only";
import { cache } from "react";
import { createFormatters } from "@/lib/format";
import { getRegionalSettings } from "@/lib/data/settings";

/** Formatters bound to Settings → Date & Regional, for Server Components and server code. */
export const getFormatters = cache(async () => createFormatters(await getRegionalSettings()));
