@AGENTS.md

# BigHawk — simple business management app

Internal app for a small IT infrastructure + software development company. It is deliberately **not** an ERP:
no HR, payroll, inventory, product catalog, sales orders, tasks/kanban, global documents, multi-currency,
money transfers, ledgers or journals. Currency is always SAR. Keep every screen understandable by a
non-technical business user.

## Stack (do not swap)
Next.js 16 App Router · TypeScript · Tailwind v4 · shadcn/ui (Radix, `components/ui`) · Prisma 7 + Neon Postgres
(`@prisma/adapter-pg`) · BetterAuth (Argon2 via `@node-rs/argon2`) · Zod · React Hook Form · Nodemailer · Lucide.

## Layout
- `app/(app)/*` — authenticated shell (sidebar + header). `app/api/auth/[...all]` is the only HTTP API (BetterAuth).
- `components/ui` shadcn · `components/layout` shell · `components/shared` reusable app pieces (PageHeader, EmptyState…).
- `lib/db.ts` Prisma singleton · `lib/auth/*` auth + permissions · `lib/format.ts` money/date formatting (use everywhere).
- `lib/generated/prisma` is generated (git-ignored) — run `npm run db:generate`.
- Server Actions live in `actions/<feature>.ts` (wrap bodies in `runAction` from `lib/actions.ts`); read queries in `lib/data/<feature>.ts`;
  Zod schemas in `lib/validation/<feature>.ts`; business math in `lib/business/*`; uploads via `lib/storage` (served by `/api/files`).
- Upload sizes/types live in `lib/storage/limits.ts` (client-safe). Server Actions carry uploads, so raising a limit also
  means raising `serverActions.bodySizeLimit` in `next.config.ts` — its default of 1 MB rejects the request before any code runs.
- Auth helpers (`lib/auth/session.ts`): `requirePermission` in pages (redirects), `authorize` in actions (throws), `getAuthContext` in layouts.
- `proxy.ts` (Next 16 middleware) only checks the session cookie exists; real checks are server-side.
- Settings: `lib/data/settings.ts` (singleton rows created lazily), option lists/defaults in `lib/settings/defaults.ts`.
  Formatting must go through `getFormatters()` (server) or `useFormat()` (client) so Date & Regional settings apply.
- Document numbers: `nextDocumentNumber(tx, type)` in `lib/business/numbering.ts`, always inside the creating transaction.
- Commercial documents (quotation / invoice / supplier quotation / purchase) share `components/documents/*`
  (form, view, line items, payment dialog, send dialog) configured by `document-kinds.ts`; totals in `lib/business/totals.ts`;
  statuses derived in `lib/business/sales-status.ts` / `procurement-status.ts` and persisted by `refreshInvoice` / `refreshPurchase`
  plus the `refresh*Statuses()` sweeps run before reads. PDFs: `lib/pdf/document-pdf.tsx` (generic) + per-module builders.
- Money in/out, profit, receivables/payables and account balances all come from `lib/business/finance.ts`
  (cash-based on payment/entry dates). Date-range presets live in `lib/date-range.ts` (shared client/server).
- Visual language (`app/globals.css`): cool grey canvas + white elevated cards (`--shadow-card`), radius `0.75rem`,
  and a tint palette (`--tint-blue|green|amber|red|purple` + `-foreground`) used for icon tiles and status pills.
  Use `StatCards` (icon tile + trend), `StatusBadge` tones, and `Card`/`Button` defaults rather than bespoke styling.
- Shell scripts: avoid multi-heredoc Bash scripts here (the shell rejects them); write files with the Write tool.
- Email: `renderEmailTemplate(key, vars)` + `sendEmail()` in `lib/email/mailer.ts`; templates are edited in Settings.
- After changing `prisma/schema.prisma`: write a migration under `prisma/migrations`, run `prisma migrate deploy`,
  `prisma generate`, and restart `next dev` (the dev server caches the Prisma client on globalThis).
- Migrations are checked in under `prisma/migrations`; seed (`prisma/seed.ts`) creates preset roles + the single Super Admin.

## Rules
- Server-side calculations are authoritative; never trust client totals. One implementation per calculation.
- Every mutation = Server Action + Zod validation + auth/permission check. Super Admin bypasses permissions.
- No delete on financial records (quotations, invoices, purchases, payments, income, expenses, projects).
- Branding (name, logo, colours, templates) comes from Settings, never hard-coded in pages.
- Document numbers come from a concurrency-safe sequence (Settings → Document Numbering).
- Statuses are derived automatically (overdue, partially paid, expired…).
- The status a person may pick comes from the `*Transitions()` helpers in `lib/business/*-status.ts`, shown by
  `components/shared/status-menu.tsx` in list tables; the Server Action re-checks the same rule.

## Checks
`npm run typecheck` · `npm run lint` · `npm run build` — all must pass before a phase is considered done.
