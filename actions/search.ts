"use server";

import { z } from "zod";
import { authorizeSignedIn } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { globalSearch, type SearchHit } from "@/lib/data/search";

const querySchema = z.string().trim().max(100);

/** Quick search used by the ⌘K palette; results are scoped to the caller's permissions. */
export async function searchEverything(query: unknown): Promise<ActionResult<SearchHit[]>> {
  return runAction(async () => {
    const auth = await authorizeSignedIn();
    return globalSearch(parseInput(querySchema, query), auth);
  });
}
