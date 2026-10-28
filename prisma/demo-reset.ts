/**
 * Wipes the demonstration company and builds it again.
 *
 * Run by hand (`npm run demo:reset`) or from a cron at midnight once the app is deployed. It is
 * safe to run repeatedly and refuses to touch anything that is not marked `isDemo`.
 */
import { resetDemo } from "./demo-seed";

async function main() {
  const started = Date.now();
  const { companyId, email, password } = await resetDemo();
  console.log(`Demo rebuilt in ${Math.round((Date.now() - started) / 1000)}s.`);
  console.log(`  company: ${companyId}`);
  console.log(`  sign in: ${email} / ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[demo] reset failed", error);
  process.exit(1);
});
