# BigHawk

A simple internal business management app for an IT infrastructure + software development company.
Single currency (SAR), intentionally **not** an ERP: no HR, payroll, inventory, product catalog,
sales orders, tasks/kanban, multi-currency, money transfers or accounting ledgers.

## Modules

| Module | What it does |
| --- | --- |
| **Dashboard** | Sales / Received / Expenses / Profit for a chosen period, profit chart (daily or monthly), what needs attention, recent activity, quick actions |
| **Customers** | Companies and individuals, documents, financial summary, tabs for quotations, invoices, payments and projects |
| **Sales** | Quotations → Invoices → Payments, PDF, email sending, partial payments, automatic statuses |
| **Procurement** | Suppliers, Supplier Quotations → Purchases → Supplier Payments, optional customer/project links |
| **Projects** | Project code, value, status, documents and financials aggregated from linked invoices and purchases |
| **Finance** | Income, Expenses, Customer Receivables, Supplier Payables, Profit, payment-account balances, reminder emails |
| **Users & Roles** | Users with photos, preset and custom roles, per-module view/create/edit/delete permissions, one Super Admin |
| **Settings** | Company, Document Numbering, VAT, Payment Terms, Payment Accounts, Notifications, Date & Regional, Document & Email Styling, Security |
| **Notifications** | In-app centre (Today/Yesterday/Earlier) plus email, configurable per event type |

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma 7 ·
Neon PostgreSQL · BetterAuth (Argon2) · Zod · React Hook Form · Nodemailer · @react-pdf/renderer · Recharts.

## Setup

1. Install dependencies (also generates the Prisma client):

   ```bash
   npm install
   ```

2. Create `.env` from the example and fill in the values:

   ```bash
   cp .env.example .env
   ```

   - `DATABASE_URL` — Neon PostgreSQL connection string (pooled).
   - `BETTER_AUTH_SECRET` — `openssl rand -base64 32`; `BETTER_AUTH_URL` — the app URL.
   - `SUPER_ADMIN_*` — credentials for the one Super Admin, used once by the seed.
   - `SMTP_*` — outgoing email (quotations, invoices, reminders, notifications).
   - `STORAGE_DIR` — optional; where uploaded files are kept (default `./storage`).

3. Apply migrations and seed preset roles + the Super Admin:

   ```bash
   npm run db:deploy
   npm run db:seed
   ```

4. Run the app:

   ```bash
   npm run dev
   ```

Sign in as the Super Admin, then set up **Settings → Company**, **Document Numbering**, **VAT**,
**Payment Terms** and **Payment Accounts** before recording real transactions.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run db:migrate` | Create + apply a migration in development |
| `npm run db:deploy` | Apply checked-in migrations |
| `npm run db:seed` | Seed roles and the Super Admin |
| `npm run db:studio` | Prisma Studio |

## How it works

- **Authorization** is server-side: pages use `requirePermission`, Server Actions use `authorize`,
  and API routes check the session. Hiding UI is never the only protection.
- **Calculations** have one home each: line/document totals (`lib/business/totals.ts`), money in/out and
  profit (`lib/business/finance.ts`), party and project financials. The database stores authoritative
  transaction data; derived values are computed the same way everywhere.
- **Statuses** are derived automatically (sent, partially paid, overdue, expired…) and refreshed before reads.
- **Document numbers** come from concurrency-safe sequences configured in Settings; numbers are never reused.
- **Financial records are never deleted** — they are superseded by status changes, deactivation or new payments.
- **Files** live outside `public/` and are served only through `/api/files`, scoped to the module they belong to.

## Deployment notes

- Uploads are stored on local disk (`STORAGE_DIR`). On a serverless host, point this at a persistent
  volume or swap `lib/storage` for object storage — it is the only file that touches the filesystem.
- Time-based notifications run after requests (no cron needed); at least one visit every 15 minutes
  keeps overdue/due-soon notices current.
# bighawkapp
