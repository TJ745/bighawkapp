/**
 * Builds the schema the engine tests run in.
 *
 * Creates `bighawk_test` inside the **same** database the app uses and applies every migration to
 * it, so the tests get a real Postgres with the real shape — numbering locks, foreign keys,
 * decimal precision and all — while production data stays in `public`, untouched.
 *
 * Run once: `npm run db:test:setup`. Re-run after adding a migration.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

const schema = process.env.TEST_DATABASE_SCHEMA ?? "bighawk_test";
const url = process.env.DATABASE_URL;

if (!url) throw new Error("DATABASE_URL is not set.");
if (schema === "public") throw new Error("The test schema must not be `public`.");

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
await client.end();
console.log(`Schema "${schema}" ready.`);

// Prisma's migration engine takes the schema from the URL rather than from an adapter option.
const separator = url.includes("?") ? "&" : "?";
const migrateUrl = `${url}${separator}schema=${encodeURIComponent(schema)}`;

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: migrateUrl },
});

console.log(`\nTest database ready. \`npm test\` now runs the engine tests against "${schema}".`);
