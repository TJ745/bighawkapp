/**
 * Loaded before anything else when the tests run (`node --import ./tests/preload.mjs`).
 *
 * `lib/db.ts` reads the schema once, when the module is first imported, so this has to be set
 * before any test file pulls in an engine. A preload is the only place early enough — and unlike
 * a shell prefix (`FOO=bar npm test`) it works the same on Windows.
 */
import "dotenv/config";

process.env.DATABASE_SCHEMA ??= process.env.TEST_DATABASE_SCHEMA ?? "bighawk_test";

if (process.env.DATABASE_SCHEMA === "public") {
  throw new Error("Refusing to run the tests against the `public` schema — they truncate every table.");
}
