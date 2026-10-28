"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { authorizeSuperAdmin } from "@/lib/auth/session";
import { BusinessError } from "@/lib/auth/errors";
import { runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/db";
import { runAsPlatform } from "@/lib/db/tenant";
import { activeCompanyId } from "@/lib/db/tenant-scope";

/**
 * Rebuilding the demonstration company from the app.
 *
 * The same thing `npm run demo:reset` does at midnight, reachable from the banner so a
 * salesperson between meetings can put the shop back without a terminal. **Super Admin only** —
 * throwing away everything in a company is not a decision to leave with whoever happens to be
 * signed in, and the person watching a demo is often not an employee at all.
 *
 * It refuses on anything that is not marked `isDemo`, twice: here, and again inside `wipeDemo`.
 * One of those checks is redundant, which is the point — this deletes a whole company.
 *
 * **It does not wait.** Rebuilding rings up every demo sale through the real engine, one
 * transaction each, which is what makes the figures agree with each other — and which measured
 * at eight minutes from a laptop against Neon. No request survives that, so the work is handed
 * to `after()` and the caller is told to come back shortly. The dependable path is still the
 * nightly `npm run demo:reset`; this is the convenience for a salesperson between meetings.
 */
export async function resetDemoCompany(): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();

    const companyId = await activeCompanyId();
    if (!companyId) throw new BusinessError("No company is in force, so there is nothing to rebuild.");

    const company = await runAsPlatform("checking the company being rebuilt is the demo", () =>
      db.company.findUnique({ where: { id: companyId }, select: { isDemo: true, name: true } }),
    );
    if (!company) throw new BusinessError("That company no longer exists.");
    if (!company.isDemo) throw new BusinessError(`${company.name} is a real customer, not the demonstration company.`);

    // Imported here rather than at the top: the seed pulls in the sale engine and the whole
    // catalogue, and no ordinary request should carry that.
    const { resetDemo } = await import("@/prisma/demo-seed");

    after(async () => {
      try {
        await resetDemo();
      } catch (error) {
        // Nobody is waiting on this any more, so the log is the only place it can be reported.
        console.error("[demo] rebuild failed", error);
      }
    });

    revalidatePath("/", "layout");
  });
}
