import "server-only";
import { resolveCompanyId } from "@/lib/db/tenant-scope";

/**
 * The company condition every `user` query has to carry, written by hand.
 *
 * `User` is deliberately **absent** from `TENANT_MODELS`, because the BigHawk operator belongs to
 * no company and a nullable `companyId` cannot be filtered blindly. The consequence is easy to
 * miss, and was missed: nothing narrows a user query automatically, so every company's Users page
 * listed every other company's people, a user created through the app was stamped with no company
 * at all, and a notification could be emailed to another customer's staff. With one customer on
 * the deployment, none of the three showed on screen.
 *
 * So this is the one place that sentence is written. Spread it into the `where` of every user
 * read and the `data` of every user create.
 *
 * The Super Admin falls out for free: their `companyId` is null, which matches no company. They
 * are edited from their own profile screen, never from a company's Users list.
 *
 * The one query that must **not** use it is the email-availability check: an email address
 * identifies an account across the whole platform (it is how someone signs in), so two companies
 * can never share one, and a clash has to be found wherever it lives.
 */
export async function currentCompanyUsers(): Promise<{ companyId: string }> {
  return { companyId: await resolveCompanyId() };
}
