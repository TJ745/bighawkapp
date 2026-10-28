@AGENTS.md

# BigHawk — Business Management + modular POS

A commercial SaaS platform under construction: a core platform, an optional **Business Management**
module (the original app, complete) and an optional **POS** module whose features follow the industry
each branch runs. A customer sees only the modules their company subscribes to. Currency is SAR.
Keep every screen understandable by a non-technical business user.

Deliberately out of scope: HR, payroll, multi-currency, money transfers, ledgers/journals.

## Platform layer (modules, branches, POS configuration)
- `lib/platform/modules.ts` — module registry **and** `appModuleOf()`, which maps each
  `PermissionModule` to its `AppModule`. `can()` consults that map, so a disabled module closes every
  page and action behind it from one place. Never re-implement that check per page.
- `lib/platform/pos-types.ts` — the 18 POS industries and the capabilities each unlocks. Feature code
  asks `posTypeHasCapability(type, "TABLES")`, never `type === "RESTAURANT"`; adding an industry is one
  row here. Client-safe (both files), so navigation reads the same registry the server authorises against.
- `lib/data/platform.ts` — the only place module/branch/POS rows are read. Lazily creates the module
  rows and the first branch. When BigHawk goes multi-tenant, the tenant filter goes here.
- Guards in `lib/auth/session.ts`: `requireModule`/`authorizeModule` (module → permission) and
  `requirePosCapability`/`authorizePosCapability` (module → industry capability → permission).
  Order matters: module, then capability, then permission — see §41 of the product spec.
- Branch in use comes from `getCurrentBranch()` (cookie `bighawk_branch`, else the default branch);
  the header switcher appears only with POS on and more than one active branch.
- **A user may be pinned to a branch** (`User.branchId`; **null means every branch** — an owner, a
  roaming manager). Permissions say *what* someone may do; this says *where*.
  - `lib/auth/current-user.ts` holds `getSessionUser` / `allowedBranchIds` / `canUseBranch`. It
    exists so `lib/data/platform.ts` can ask who is signed in **without** importing `session.ts`,
    which already imports platform — that would be a cycle. Neither file grew its own copy.
  - `getCurrentBranch()` treats the cookie as a **request, not permission**: a pinned user carrying
    another branch's cookie is given their own branch, and falls back to it rather than to the
    company default.
  - `listActiveBranches()` is **scoped** (where I may work) and feeds every picker — switcher,
    stock screen, receive dialog. `listBranches()` stays unscoped for Settings → Branches and
    Settings → Modules: administering branches is not the same as working in one.
  - `listTransferDestinations()` is deliberately **unscoped**. Working at a branch and *sending
    stock to* one are different things — scoping it would have made transfers impossible for the
    storekeepers who make them, which is exactly what the first cut of this change did.
  - Narrowing a picker is never the check: `assertBranchAllowed()` guards every action that takes a
    branch **from the client** (stock count, transfer source, goods receipt). A transfer's
    *destination* only has to be active, because sending goods to a shop you do not staff is normal.
- Settings → Modules (Super Admin) switches modules and sets each branch's industry;
  Settings → Branches (SETTINGS permission) is branch CRUD.
- Consequential changes are recorded with `recordAudit()` (`lib/platform/audit.ts`) and read back
  at **Settings → Activity** (`lib/data/audit.ts`, `/settings/audit`, `SETTINGS view`).
  - The trail says who changed what across every module, so whoever reads it sees the shape of
    the whole business — administrator territory, and among the presets only Admin has it.
  - Filtering is by **area**, a prefix of the action string (`sales.`, `pos.`, …), never a list
    of the eighty-odd actions: a list would be out of date by the next feature and would quietly
    hide whatever it forgot. `AUDIT_AREAS` lives in the client-safe `lib/platform/audit-areas.ts`
    because the table is a client component and `lib/data/audit.ts` is `server-only`.
  - Every filter goes in its own `AND` entry, so one can never overwrite another's `OR`.
  - The operator sees **every customer at once** (`listAuditEntriesAcrossCompanies`, the only
    audit read that says `runAsPlatform`) while they have singled none out; once they are working
    on a company it is that company's screen, like every other screen. A separate function rather
    than a flag, because looking across customers is what the tenant filter exists to prevent.
  - An entry about a company is written **inside that company** — `actions/companies.ts` wraps
    its `recordAudit` in `runForCompany` — or "Company B created" lands in company A's log, where
    it means nothing, and is missing from the only log where it belongs.
  - **The operator's own work is filed with the customer and hidden from them.**
    `AuditLog.byPlatform` is set by `recordAudit` from `auth.user.isSuperAdmin`, never passed in,
    so no call site can forget it or claim otherwise. The row keeps the `companyId` it affected,
    because "their VAT rate was changed" means nothing in any other log; what changes is who
    reads it. A customer's staff see their colleagues' work (`listAuditEntries`), the operator
    sees everything whichever way they look (`includePlatform`, and the across-companies read).
    Both halves of that are silent when wrong — a customer reading a stranger's name in their
    own log, or the operator's changes missing from the only log holding them — so
    `tests/engines/operator.test.ts` pins them, counts included: a filtered list with an
    unfiltered total is a pager promising rows it will not show.
  - **Everything consequential is now recorded.** POS, stock, the catalogue and the platform
    already were; invoices, quotations, purchases, supplier quotations, payments, income,
    expenses, customers, suppliers, projects, users, roles, settings and own-profile changes were
    not, which made "who did what" a question the screen could not answer for most of the app.
    A settings change records its **section** by name, because "something in Settings changed
    last Tuesday" is not an answer anybody can act on.
  - **Taking a copy is recorded too.** A CSV export is a bulk read of the customer list, and its
    audit entry lives inside `build()` in `actions/export.ts` — the one function every export
    goes through — rather than in each of the seven actions, because "who downloaded this" is
    not a question to answer by remembering.
  - Amounts in a summary go through `auditMoney()`, **not** `getFormatters()`: an entry is a
    record written once and read months later, so it must not change meaning because somebody
    switched the number format afterwards, and a settings read on every audited action would be
    a query nobody asked for.
  - `lib/data/audit-areas.test.ts` fails if an action is written under a prefix no area covers.
    That failure is otherwise silent in the worst way: the entry is stored, it appears under
    "Everything", and only the filter quietly never finds it. It caught `module.` immediately.

## Multi-tenancy (one database, many companies)
One deployment serves many customers. A `Company` row is a customer; **every** company-owned model
carries a `companyId`, and no query says so.
- `lib/db/tenant.ts` holds the scope in an `AsyncLocalStorage`: `runForCompany(id, …)` and
  `runAsPlatform(reason, …)`, plus `currentCompanyId()` / `requireCompanyId()`. The store lives on
  `globalThis`, like the Prisma client, because a module-local one is only as good as the module
  being loaded once — a bundler that resolves `@/lib/db/tenant` and `./tenant` separately gives the
  writer one store and the reader another, and the filter then **silently** falls back to inferring
  a company. That bug passed every test and was found against real data.
  Both helpers `await` the callback inside the scope: a Prisma call is lazy, so a callback that
  merely *returns* `db.x.find(…)` would otherwise run after the scope had been left.
- `lib/db/tenant-filter.ts` is the rule, pure and unit-tested: narrow a `where`, stamp a `create`
  (nested creates too), and re-dispatch `findUnique` as `findFirst` — a unique key leaves no room
  to add a condition, and a compound key (`variantId_branchId`) is spread back into its fields
  because `findFirst` has no such field. `lib/db.ts` resolves the scope and applies the decision.
- `lib/db/tenant-models.ts` is the registry of company-owned models, generated from the schema.
  A model missing from it is not refused — it is read **across every customer**, which is why
  `tenant-models.test.ts` re-reads `schema.prisma` and fails if the two disagree.
- `lib/db/tenant-scope.ts` works the company out from the request, so a page is scoped by existing
  rather than by remembering a wrapper. In order: the **address** (`TENANT_BASE_DOMAIN` set, and a
  subdomain naming a `Company.slug` — `lib/platform/tenant-host.ts`, pure and tested); then the
  signed-in user's own company; then the operator's chosen one; then the deployment's single
  company. Sign-in and password reset do better where they can, scoping to the company the *email
  address* names.
  - **A disagreement is refused, not resolved.** If the address names one company and the account
    belongs to another, the scope is `null` and nothing loads. Serving either would hand somebody
    a working session against a company they do not belong to.
  - An **unknown** subdomain resolves to nothing rather than falling back: a slug nobody owns must
    not quietly become somebody else's shop. Unset `TENANT_BASE_DOMAIN` means host routing is off
    and the deployment serves one company, which is the honest state of most installs.
- **Onboarding a customer** is Settings → Companies, Super Admin only — the one screen in the app
  that looks across companies, and every read in `lib/data/companies.ts` says so with
  `runAsPlatform`. Creating one also runs `seedCompanyDefaults` (`lib/platform/new-company.ts`)
  inside the new company's scope: a `Company` row on its own is a shell with no roles to grant, no
  modules and nowhere to sell from. The preset roles live in `lib/platform/preset-roles.ts` because
  the seed and onboarding must create the *same* roles; while they lived only in `prisma/seed.ts`
  a company made through the app would have got none.
  - The operator picks which customer to work on (`bighawk_company`, a cookie read like the branch
    one — a request, not permission), and the screen says loudly which one is in force, because
    everything they then touch is somebody's real records.
  - A company is switched **off**, never deleted: its rows cascade from it, so deleting one would
    take every invoice, sale and stock movement with it, and "we stopped using BigHawk" is not the
    same sentence as "none of that happened". The last active company cannot be switched off.
- `companyId` is `@default("")` purely so Prisma's create types do not demand a column the filter
  fills in. It is not a fallback: `''` is no company's id, so an unstamped write is refused by the
  foreign key.
- Business identifiers are unique **per company** (`@@unique([companyId, number])` and friends), so
  two customers can each have their own INV-2026-0001. `FinanceCategory` was missed in that
  sweep and stayed unique on `(kind, name)` platform-wide: the first customer to create an
  expense category called "Rent" took the name from everybody else, who were told "a category
  with this name already exists" about a row they had no way of seeing. Not a disclosure — one
  customer silently blocking another, which is the quieter half of the same mistake. A unique
  index on a tenant-owned model that does not start with `companyId`, or with a parent that is
  itself company-scoped, is a bug. Settings singletons are one row per company
  (`@@unique([companyId])`), no longer `id: "default"`.
- **Hand-written SQL is not filtered** — the extension rewrites Prisma's operations, not ours. The
  three statements that exist (`numbering.ts` and `pos-counter.ts` locking `FOR UPDATE`, the
  overdue sweep in `data/sales.ts`) name the company themselves. Any new raw query must too.
- **There are two ways to ask which company, and app code wants the async one.**
  `resolveCompanyId()` (`tenant-scope.ts`) asks the *request*, the way the filter does.
  `requireCompanyId()` (`tenant.ts`) reads the scope *store*, and **a request never puts anything
  there** — the filter resolves per query, lazily, which is the whole point. Reaching for the
  synchronous one in request code therefore throws, and it did: every document number and every
  overdue sweep, on every page load, while the entire suite stayed green, because tests always
  wrap themselves in an explicit `runForCompany`. `tenant-call-sites.test.ts` now keeps them
  apart by reading the source, since no engine test can reproduce the condition.
- Reads memoised with React `cache()` must be keyed by company as well as by request —
  `perCompany()` in `lib/data/settings.ts`. A process that acts for two companies otherwise hands
  the second the first one's settings.
- The Super Admin belongs to **no** company (`User.companyId` is null for them alone) and is unique
  platform-wide. The seed creates one company and seeds roles and modules into it.
- **`User` is the one well-used model the tenant filter does not narrow.** Its `companyId` is
  nullable, because the operator belongs to no company, so it is absent from `TENANT_MODELS` and
  a user query is only as scoped as whoever wrote it. Three were not, and with one customer on
  the deployment none of them showed on screen: `listUsers()` returned **every** company's staff,
  a user created through the app was stamped with **no** company, and `notify()` picked
  recipients across customers and emailed them.
  - `currentCompanyUsers()` in `lib/platform/user-scope.ts` is the one place that condition is
    written; spread it into the `where` of every user read and the `data` of every create.
  - An id from the client goes through `findFirst`, never `findUnique` — a unique key leaves no
    room for the company condition — and the **write** carries it too (`updateMany`), because
    the lookup is the half that is easy to remember and the write is the half that does damage.
  - Looking an account up **by email** stays unscoped, deliberately: an address is how somebody
    signs in, so it names one account platform-wide and a clash has to be found wherever it
    lives. Two customers can never share one, which is also why onboarding checks it *before*
    writing the company row.
  - **Your own account is not a company lookup either.** `/profile` went through `getUser`, which
    is scoped, so the Super Admin — who belongs to no company — got "not found" on their own
    profile page. `getOwnProfile()` reads by the id the *session* carries, which is nobody
    else's by construction. The two admissions the guard test accepts are therefore
    `// across-companies:` and `// own-account:`, each stating which it is.
  - `user-scope.test.ts` reads the source and fails on any user query that names no company. No
    engine test can catch this: they run as a single company, where scoped and unscoped return
    the same rows. A read that is across companies **on purpose** says so in a comment —
    `// across-companies: why` — so the admissions are greppable rather than implied.
  - Deleting a `Company` does **not** take its users with it (an optional relation defaults to
    `SetNull`), unlike every cascading model. Harmless in the app, where a company is switched
    off and never deleted, but a cleanup script has to remove them itself.
- **Seats and shops are sold, so they are counted** (`lib/platform/quotas.ts`).
  `Company.userLimit` / `branchLimit` are set by the operator on the company's own row and are
  read-only to the customer. Both counts include the **first of their kind** — the administrator
  and MAIN — because "five users" is easier to sell and explain than "five plus one", and both
  count only what is **active**, so deactivating somebody frees the seat. Reactivating therefore
  goes through the same check as creating, or the limit is one deactivate-and-reactivate away
  from meaning nothing. Lowering a limit below current usage is allowed and switches nothing
  off: it only refuses anything new.
  - The figure is **shown where it is spent**: `QuotaNote` sits beside "New User" and "New
    Branch", and the button is disabled once the count is reached. The refusal in the action is
    still the check, but a count that only appears at the moment of refusal arrives after
    somebody has filled in a form. Screen and refusal read the same query, so they cannot
    disagree.
  - `makeUser` in the test factories stamps `companyId` for the same reason the app does.
    Without it every test user belonged to nobody, invisible to every scoped read, and a suite
    built on them would quietly have been testing the wrong thing.
- **Onboarding creates the person who will run the company**, not just the company.
  `seedCompanyDefaults(name, admin)` writes the `User` *and* its `providerId: "credential"`
  `Account` in one transaction — one without the other is a company nobody can sign in to, which
  looks exactly like a working one from the operator's list. The password is typed by the
  operator and passed on; there is no invitation email, because a company created a minute ago
  has no mail server configured and an administrator who cannot sign in has nowhere to set one up.
- **The demonstration company** (`Company.isDemo`, `prisma/demo-seed.ts`, `npm run demo:reset`)
  is what a salesperson shows a prospect: one customer, "Al Noor Group", running four shops so
  that a single sign-in and the branch switcher walk through most of the POS — a restaurant
  (tables, kitchen, modifiers), a cafe (collection numbers), a boutique (barcodes, variants) and
  a salon (appointments, commission) — with Business Management on top.
  - **It never sends email.** `sendEmail()` refuses for a demo company, checked once centrally
    rather than at each call site. `getSmtpConfig()` falls back to the deployment's own
    `SMTP_*` variables when a company has filled none in, so without this a prospect clicking
    "send invoice" would post real mail, to any address they typed, from our server — and
    nothing on screen would say it had happened.
  - **Every date is counted back from today.** A demo whose newest invoice is from March reads
    as abandoned, and it is the first thing anybody notices.
  - **The money is made by the real engines** — `createSale` for takings, `buildItemRows` for
    invoice lines. Rows written by hand would give figures the app's own reports disagree with,
    and the demo would contradict itself on screen in front of the prospect.
  - It deliberately contains the states that sell the software: an overdue invoice, a part-paid
    one, a draft, stock under its minimum. Aging, receivables, statements and the dashboard's
    "needs attention" are the best arguments in the product and every one is blank without them.
  - **Rebuilding takes minutes, not seconds** — measured at ~8 from a laptop against Neon,
    because each sale is its own transaction and each is a round trip. The nightly
    `npm run demo:reset` is the dependable path; the **Reset now** button in the banner is
    Super Admin only and hands the work to `after()` rather than making a request wait for it.
  - The wipe is guarded twice, by handle and by `isDemo`, and deletes users explicitly —
    deleting a company only nulls their `companyId`, so the next run would collide on the email
    address while leaving orphans behind.
- **The operator's home is the companies list, not a dashboard.** They belong to no company, so
  until they choose one the scope falls back to the oldest and every figure would be somebody's
  presented as if it were theirs — so `/dashboard` sends them to Settings → Companies. That
  applies **however many customers there are**: one click is cheap, and "whose records am I
  looking at" should not have an answer that depends on the size of the deployment.
  - Cards, not a table: this is a screen for choosing, and each card carries seats and branches
    used against what was sold, how much trade, and whether the company is switched on — enough
    to pick the right customer without opening anything. **Open** chooses the company *and* goes
    to its dashboard, because choosing was never the task; working inside it is.
  - `operatorContext()` decides both the redirect and the strip at the top of **every** screen
    (`components/layout/acting-as-bar.tsx`), so the two can never disagree. The strip matters
    more than the companies screen's own banner did: the danger is not where you pick a company,
    it is three clicks later on an invoice list that looks like everybody else's.
- **A `"use server"` file may only export async functions.** `actions/companies.ts` exported its
  Zod schemas, which makes the whole module unimportable from anything that is not an action,
  with an error naming neither the schema nor the file. They live in `lib/validation/companies.ts`
  like every other schema.

## Catalogue & inventory (POS module)
- `Item` covers **products and services**; stock always hangs off an `ItemVariant`, so an item sold
  in one form still has a single default variant. Nothing special-cases "product without variants".
- **`lib/business/inventory.ts` is the only place a stock level may be written.** Callers use
  `applyStockMovement` (inside their own transaction), or `setStockLevel` / `adjustStock` /
  `transferStock`. Each writes the level and the `StockMovement` that explains it together, so every
  quantity can be traced. Never update `StockLevel` directly — that is how stock and history drift.
- Quantities are `Decimal(14,3)` (weighed goods); money stays `Decimal(14,2)`. Going below zero is
  refused unless the caller passes `allowNegative`.
- **POS permissions are split by job, not by screen**, because a kitchen hand, a waiter and a
  cashier work the same shop at the same time and must not see each other's screens:
  - `POS` — the till: register, returns, sales history, shifts, and counter work (work orders,
    rentals, rooms). `POS_ORDERS` — tables and tabs (the waiter). `POS_KITCHEN` — the board, and
    nothing else. `POS_BOOKINGS` — the appointments diary (the front desk).
    `INVENTORY` — the catalogue, stock and the POS setup screens.
  - All four POS_* values are owned by the **POS product module** in `lib/platform/modules.ts`, so
    switching POS off still closes every one of them from the one place. A new one without an owner
    would be treated as core and stay open with POS off — `registry.test.ts` fails if that happens.
  - The capability guards narrow by **industry**; the permission argument narrows by **person**.
    `requirePosCapability("KITCHEN", "POS_KITCHEN", …)` reads: this branch must cook to order, *and*
    this person must work the kitchen. Before the split the second half was always just "POS", so
    one grant handed the kitchen the day's takings.
  - `PERMISSION_MODULES` in `lib/auth/permissions.ts` **is** the role editor and also the source of
    `AuthContext.visibleModules`. A permission missing from that list can never be granted *and*
    never appears in navigation — which is exactly how `INVENTORY` came to be seed-only and the
    catalogue screens unreachable from the sidebar for a stock keeper. A test keeps it complete.
  - Nav children carry their own `module` and inherit the parent's when they do not; a section is
    shown when **any** child is, which is what lets a kitchen hand see the POS section at all.
    `visibleNavItems` never renders an empty section — that invariant is what makes dropping the
    parent's own permission check safe, and it is tested.
- **`Item.branchId` says which shop sells it; null means every shop.** The till used the branch
  only to look up a stock figure, so a company running a restaurant and a salon put hairdressing
  on the restaurant's screen — a till nobody could work from. `listRegisterItems` now filters
  `OR: [{ branchId: null }, { branchId }]`.
  - Null rather than a required choice, because most companies sell the same things everywhere
    and a field they must answer for every item is a tax on the common case. The picker, and the
    catalogue list's **Sold at** column, both appear only where there is more than one branch:
    "sold at our only shop" is not a question, and a column of identical values is noise. The
    column is not optional where it does apply — without it a manager who has pinned items has
    to open each one to find out which.
  - Narrowing the picker is never the check — `assertItemBranch` in `actions/items.ts` refuses a
    branch that is closed or belongs to another customer, because an item pinned to one would
    simply stop appearing on every till with nothing on screen to explain why.
  - **The till's category tabs are derived from the items it offers**, not read separately. They
    were a company-wide query, so a salon till carried empty "Food" and "Clothing" tabs that
    showed nothing when tapped. Derived rather than filtered alongside, so the two cannot drift
    apart again; the fetched list is *filtered* rather than rebuilt from the items, which keeps
    the manager's own `sortOrder` instead of going alphabetical.
  - **The catalogue list follows `User.branchId`, not the branch switcher.** Permissions say what
    somebody may do; the pin says where. Someone pinned to one shop sees that shop's items plus
    the ones sold everywhere — a salon manager has no use for a page of mixed grills. A company
    admin is pinned to nothing, sees all of it, and has the **Sold at** column to tell them
    apart, because maintaining every shop's catalogue is their job. The condition is **AND**-ed
    on: the search already puts an `OR` on that object and a second would silently replace it.
  - The **till stays single-branch for everybody**, admin included: nothing is sold at "all
    branches", so there is no version of that screen where the distinction means anything.
  - `ItemCategory` deliberately gets no branch. "Drinks" is genuinely shared between a
    restaurant and a cafe, and pinning categories would mean the same name four times and four
    sets of figures to reconcile. What a person sees is derived from the items they can see.
- A variant that already has movements is **deactivated, never deleted**, when dropped from the form.
- **`BARCODE` and `VARIANTS`** shape the item form and the till, rather than adding pages of their own:
  - `BARCODE` (retail, grocery, apparel, bakery, repair, wholesale, cinema) puts **Barcode and SKU**
    on a single-form item and gives the till a scan-first opening — the search box takes focus and
    the Scan button appears. Without it the till is tap-first, because stealing focus in a salon just
    puts a keyboard in front of someone trying to tap a service. `WEIGHT` adds **PLU** the same way.
    Until this existed those codes lived *only* inside the variant matrix, so a shop that scans could
    not barcode a plain product without pretending it had variants.
  - `VARIANTS` (retail, apparel, wholesale) decides whether the size/colour matrix is offered at all.
  - Both are decided **server-side** on the page from `posTypeHasCapability` and passed down as
    props, the same way the scale config is — a client never asks the registry itself.
  - Hiding the matrix is not the check: `assertVariantsAllowed` in `actions/items.ts` refuses a
    second variant without the capability, naming the industry in the refusal. An item that
    **already** has several keeps them and stays editable — a branch changing industry must never
    strip data nobody can then reach — so what is refused is *adding* to the count, not keeping it.
  - A capability that gates nothing is a promise the Modules screen makes and the app breaks, so
    `lib/platform/registry.test.ts` fails if any `POS_CAPABILITIES` entry is referenced nowhere.

## POS selling (the till)
- `lib/business/pos.ts` is the sale engine: one transaction allocates the number, writes the sale
  and its lines, moves stock via `applyStockMovement`, and records payments against the company's
  `PaymentAccount` rows. Prices, VAT and costs are resolved **server-side** from the catalogue —
  a cart total from the client is never trusted.
- Line arithmetic is `lib/business/totals.ts`, the same functions the invoice form uses, so a POS
  receipt and an invoice for identical lines agree. A cart-wide discount is folded into each line's
  discount so VAT is charged on what the customer actually pays.
- **POS takings are income**: `PosPayment` is a source inside `lib/business/finance.ts`, so money-in,
  account balances and profit include POS without a second set of figures. Voiding deletes the
  payment rows, which takes the money back out of Finance.
- Held sales (`PARKED`) take no money and move no stock; completing them does. Voiding returns the
  stock (`SALE_RETURN`) and needs POS *delete* permission, not just the right to sell.
- A shift's expected drawer = float + cash sales + cash in − cash out. Card and transfer takings
  never enter the drawer. Change is only ever given against cash.
- `PosSaleItem` snapshots name, SKU, price **and unit cost**, so receipts and margin stay correct
  after the catalogue changes.
- **Returns** (`lib/business/pos-returns.ts`): a `PosReturn` against the original sale. The refund is a
  **negative `PosPayment` row tagged with the return**, so money out uses the one path money in does —
  Finance, account balances and the drawer all net out. Amounts are recomputed from the original
  line's price/discount/VAT by `calcLine`, never apportioned by a ratio.
- `PosSaleItem.returnedQuantity` caps partial returns. A write-off (`restock: false`) still refunds but
  leaves stock alone. The sale becomes `PARTIALLY_REFUNDED` or `REFUNDED`; a refunded sale cannot be voided.
- Refunds belong to the shift that **gives** them, not the one that made the sale, so
  `getShiftSummary` counts takings and refunds with separate queries.
- Returns need POS *edit* (a cashier handles them); voiding needs POS *delete*.
- Sales figures are reported gross, refunded and net — never one number that quietly mixes them.
- **Selling with no connection** (`lib/offline/sale-queue.ts` + `components/pos/offline-sales.tsx`).
  The connection drops and the cashier keeps selling; `public/sw.js` then lets the till be
  **reopened** during the same outage. Those are two separate promises and the UI says which one
  it can keep.
  - The queue holds the **intent** of a sale — what was sold, to whom, how it was paid — and never
    its totals. On replay the server prices it again, allocates the real number and moves the
    stock, so "server-side calculations are authoritative" stays true even though the server was
    not there at the time. IndexedDB, not memory: an outage outlasts a page refresh.
  - **`PosSale.clientReference` is what makes a replay safe to repeat.** A connection that drops
    *after* the server committed leaves the till believing it failed, so the queue sends again.
    `createSale` returns the sale it already made (`alreadyRecorded: true`) instead of a second
    one, backed by a unique index. Without it a dropped acknowledgement invents money and loses
    stock, and nothing in the records shows which sale was real.
  - A **refusal and an outage are different answers**. The server saying no — the stock went while
    the till was offline — is kept and shown to a person, because retrying cannot help. Failing to
    reach the server at all is left alone to try again. Replay is in order, one at a time.
  - A **held bill is never queued**: it takes no money and moves no stock, and a hold the server
    has not seen would be invisible to every other till.
  - The offline receipt is **provisional** — no document number exists yet, so the dialog says the
    receipt follows and offers no links that would go nowhere.
- **Reopening the till with no connection** is `public/sw.js`, a hand-written service worker.
  Without it the queue only survives while the page stays open: reload the browser on a dead
  network and there is no HTML to render.
  - It keeps **only `/pos/register`**, network-first, plus `/_next/static/*` cache-first (those
    names are content-hashed, so a cached copy is never the wrong version). Every other screen
    reads live figures that would mislead from yesterday's copy, so none of them is kept.
  - **Three things are never cached, and each failure would be silent.** Anything that is not a
    GET — a Server Action is a POST, and answering one from a cache would invent money. Anything
    under `/api`, which is where signing in happens. And the router's own RSC fetches: a reload
    announces itself, a soft navigation served from a stale payload does not.
  - A **redirected** response is never kept either. An expired session sends the register page to
    the sign-in screen, `fetch` follows it, and a perfectly good 200 comes back for the wrong
    page — stored under the till's URL, every offline reload afterwards would open a form nobody
    can use.
  - `proxy.ts` **excludes `sw.js` from its matcher**. A signed-out request for it was redirected
    to the sign-in screen, and a worker script that answers with a redirect simply never
    registers — the till would quietly lose offline reopening with nothing to say why.
  - It is a **module** worker, so the rule is a real export that `lib/offline/cache-policy.test.ts`
    and `sw-respond.test.ts` load from `public/sw.js` itself: what is tested is what ships. The
    worker half is guarded, so importing the file in Node runs nothing.
  - Registered **only in production**, from the till. Dev rebuilds chunks constantly, so a cached
    dev page points at files that no longer exist and the till comes back up broken.
  - **Sign-out clears the cache** (`clearTillCache`), because a till is a shared device and the
    cached page holds whatever the last cashier could see. Queued sales are deliberately left
    alone: that is money, and it belongs to the shop rather than to whoever was signed in.
  - `app/manifest.ts` makes the till **installable** — a tablet can keep it on the home screen and
    open it full-screen, with no browser chrome for a cashier to wander into. Built from the
    company's own settings (name, `primaryColor`, logo) rather than hard-coded, like every other
    piece of branding; `public/icon.svg` is only the fallback mark. The manifest is excluded from
    `proxy.ts` for the same reason `sw.js` is: the browser fetches it without a session, and a
    redirected manifest is ignored just as silently as a redirected worker.
  - **The worker warms its own cache on activation**, rather than waiting for somebody to reload.
    The page that *registers* a worker was fetched before the worker existed, so it can never be
    cached — which meant a till opened once and left open was never saved, and the first anyone
    knew was a browser error page during an outage. It looked exactly like a worker that had not
    installed. One visit is now enough.
  - The cache lookup passes **`ignoreVary`**. Next sends `Vary: RSC, Next-Router-State-Tree, …` on
    its HTML, so one differing header between the request that stored the page and the one asking
    for it would make the cached copy invisible: a cache holding the page and refusing to hand it
    over, indistinguishable from an empty one.
  - **Verified end to end** in Firefox against a production build: the worker registers, the till
    page lands in `bighawk-till-v1-documents` on first visit, and with the server **stopped**
    (`Ctrl+C`, not network throttling — `localhost` keeps working when the Wi-Fi goes off) a
    reload brings the till back up.
  - `experimental.useOffline` is deliberately **off** — see the note in `next.config.ts`. It makes
    a failed Server Action hang and retry instead of rejecting, and the queue works precisely by
    catching that rejection; with it on, nothing would ever reach the queue. It also does not do
    this job: Next's own guide says a full reload offline still fails without a service worker.

## Industry layers
First one built — **weighed goods** (the `WEIGHT` capability: grocery, bakery):
- `lib/business/scale-barcode.ts` parses a scale-printed label into a PLU plus a weight or a price.
  Pure and client-safe: the till parses the scan to build the line, the server parses it again when
  the sale is recorded. Layouts vary by scale, so prefix / PLU digits / weight-or-price are
  per-branch settings on `PosConfiguration`; the settings screen states the expected digit count,
  because a layout that does not match the shop's scale simply never matches a scan (EAN-13 is
  1 prefix + 6 PLU + 5 value + check = 13).
- `ItemVariant.plu` is the short code scales and keypads use; it is unique, like SKU and barcode.
- The scale fields appear **only** where `posTypeHasCapability(type, "WEIGHT")` — the pattern every
  later industry follows: one capability, settings gated on it, logic in `lib/business`.
- Measured units (kg, g, L, ml, m, hour) step by 0.1 at the till and show their unit price.

Second — **modifiers** (the `MODIFIERS` capability: cafe, restaurant, fast food, juice/bakery):
- A `ModifierGroup` is a question ("Milk", "Extras") with `minSelect`/`maxSelect`; `ModifierOption`
  carries a `priceDelta` that may be negative. Groups are attached to items (`ItemModifierGroup`),
  so one group serves the whole menu — manage them under POS → Modifiers, tick them on the item.
- `resolveCart` in `lib/business/pos.ts` enforces min/max and refuses an option that belongs to
  another item, then adds the deltas to the **catalogue** price server-side. The till sends chosen
  option ids and the base price only; a client-side modifier total is never trusted.
- Every chosen option is snapshotted on `PosSaleItemModifier` (group name, option name, delta), so
  receipts and the sale detail still read correctly after the menu changes. An option that has been
  sold is deactivated, never deleted.
- The same drink with different options is a separate cart line (`modifierSignature()`); identical
  options stack.
- Permission is `INVENTORY` (menu maintenance), gated by `authorizePosCapability("MODIFIERS", …)`.
- A withdrawn option or group stops being asked about; it never makes an item unsellable. An order
  opened before the change is still re-priceable (`resolveCart(… allowWithdrawnModifiers: true)`),
  while a *new* sale with a withdrawn option is refused.

Third — **tables** (the `TABLES` capability: restaurant, bar):
- An open order **is** a `PARKED` `PosSale` with a `tableId` — not a second kind of document — so
  catalogue pricing, modifiers, VAT, receipts and Finance all apply to it unchanged.
  `PosSale.guestCount` carries covers. A table with an open order cannot be taken out of use.
- `lib/business/pos.ts` gained the order lifecycle: `updateParkedSale` (a round replaces the whole
  order, re-priced server-side, **keeping the number**) and `completeParkedSale` (money, stock and
  status in one transaction, dated the day it was paid, because Finance is cash-based).
- `lib/business/pos-tables.ts` holds only what tables add: `transferOrder`, `mergeOrders`,
  `splitOrder`. Moving lines between held orders never touches stock — a held order has not moved
  any — which is why they are refused on anything already paid.
- Each line's `discountPercent` already includes the whole-bill discount, so **an order carries no
  cart-wide figure**: `recomputeOrderTotals` sums the lines and clears `cartDiscountPercent`. That
  is what makes splitting and merging bills add up, whatever discounts they were given.
- The floor plan (`/pos/tables`) decides which order the register opens: `?order=` picks a bill up,
  `?table=` starts one. The page re-checks both against the branch, and the register's `key` makes
  a different order a fresh screen rather than two carts merged.
- Table CRUD is `/pos/tables/setup` under `INVENTORY` (manager territory, like registers); seating,
  paying, moving, merging and splitting are `POS` (`create` to take an order, `edit` to move one).

Fourth — **kitchen** (the `KITCHEN` capability: restaurant, quick service):
- `lib/business/pos-kitchen.ts`. A `PosKitchenTicket` is one **round** sent through, and it is a
  snapshot: adding a round rewrites the bill's lines, so the kitchen's copy has to stand alone.
- What has not been sent is therefore a **comparison**, not a flag: `kitchenDelta()` groups the bill
  and every non-cancelled ticket by item **plus its option signature**, so a rare steak and a
  well-done one are never conflated, and a second send carries only the difference. Cancelling a
  round puts its items back on the outstanding list — the kitchen never made them.
- Tickets move forward only (`NEW → PREPARING → READY → SERVED`, or `CANCELLED`); each stage keeps
  its own timestamp, which is what makes "how long did this take" answerable.
- A ticket whose bill shrank afterwards shows **"the bill changed"** on the board, so nobody cooks
  something that nobody is paying for.
- Where there is a floor plan, the waiter sends rounds (one button: save the round = send it). A
  **counter** kitchen (quick service, no `TABLES`) sends itself when the sale is rung up — inside
  `completeSale`, and a ticket that fails to write never undoes the sale: the cashier is told
  (`kitchenError`) and the money stands. A held sale is never sent; nothing cooks until it is rung up.
- The board (`/pos/kitchen`) refreshes itself every 15s so it can live on a screen above the pass;
  elapsed minutes are worked out in `lib/data/kitchen.ts`, server-side, so every screen agrees.
- Seeing the board is `POS view`; moving a ticket is `POS edit`.

Fifth — **recipes** (the `RECIPES` capability: restaurant, cafe, bakery):
- `lib/business/recipes.ts`. A kitchen counts milk, not lattes, so **a variant with a recipe does
  not move its own stock** — its ingredients do. That swap happens once, in `resolveCart`
  (`movesStock: recipe.length === 0 && …`), which is why nothing is ever deducted twice.
- A dish with no cost of its own is costed from its recipe, so margin works without anyone pricing
  a plate by hand. An explicit cost still wins.
- Recipes are **one level deep** by design: `assertRecipeAllowed` refuses a dish as its own
  ingredient, the same ingredient twice, an ingredient that has a recipe, and giving a recipe to
  something already used as one. Those are sentences from the engine, not Zod field errors — a
  dialog must never say "check the highlighted fields" with nothing highlighted.
- `PosSaleItemIngredient` snapshots what each sold line actually consumed (quantity and unit cost),
  like the line's price. Voids put back the snapshot; a partial return puts back
  `returned ÷ sold` of it. **Never recompute from today's recipe** — the menu changes.
- An untracked ingredient (tap water) is still recorded on the line but moves no stock. An
  ingredient that runs out refuses the sale, because `applyStockMovement` will not go negative.
- `/pos/recipes` is the recipe book, under `INVENTORY` — the same permission as the stock it spends.

Sixth — **tabs** (the `TABS` capability: bar) and **quick order** (`QUICK_ORDER`: quick service,
cafe, food truck). Both reuse the open-bill lifecycle rather than adding one:
- A tab is the same held bill as a table order with `PosSale.tabName` instead of `tableId`, so
  rounds, merging, splitting, the kitchen and settling all work on it unchanged. `/pos/tabs` is the
  bar's floor plan. Two tabs may share a name — it is what the bar calls a person, not a key.
- `saveOrder`/`payOrder` pick the capability from **what is being saved**: a tab needs `TABS`, a
  table needs `TABLES`. A pub with no floor plan therefore gets tabs without tables, and a
  restaurant the other way round — one action, no industry names in it.
- Quick service calls out a **collection number** ("Order 42"): `PosSale.orderNumber`, allocated by
  `nextOrderNumber()` from a `PosOrderCounter` row locked `FOR UPDATE`, exactly as document
  numbering locks its sequence. It restarts every morning per branch, is only taken where the
  industry has `QUICK_ORDER`, and never by a held sale. It is **not** a document number: the
  receipt still carries `POS-…` as the record.
- The number is shown where it is used: large on the receipt dialog and the printed receipt, and as
  the kitchen card's title in place of a table name.
- `QUICK_ORDER` also gives the till one-tap **Cash / Card** buttons for the exact amount (the till's
  own cash account, else the first bank account); the payment dialog stays for change, split
  payments and references.

Seventh — **staff commission** (`STAFF_COMMISSION`) and **appointments** (`APPOINTMENTS`: salon,
spa, gym):
- `StaffMember` is separate from `User` on purpose: most stylists never sign in, and the ones who do
  are linked. Staff records are `INVENTORY` work (shop setup); bookings are `POS` (the front desk).
- Commission (`lib/business/staff.ts`) is worked out on **what the customer paid for the line, VAT
  excluded** — commission on tax would pay staff out of the government's money. The rate and the
  amount are snapshotted on `PosSaleItemStaff`, so changing someone's rate never rewrites what they
  are already owed. A void or a return **reverses** the amount (`reversedAmount`) instead of
  deleting the row: "earned then returned" is not the same story as "never earned", and the report
  shows earned, taken back and owed separately.
- Any line may name someone, not just a service — a salon pays commission on the shampoo it sells
  too. Someone who has left, or who belongs to another branch, cannot take a line.
- A booking (`lib/business/appointments.ts`) is time: services are priced **and timed** from the
  catalogue, a product cannot be booked, and `assertStaffFree` refuses a double-booking (cancelled
  and no-show bookings do not hold time). Statuses run forward: `BOOKED → CONFIRMED → ARRIVED →
  COMPLETED`, with `NO_SHOW`/`CANCELLED` as the ways out.
- **Only paying for it completes a booking**, and paying is an ordinary POS sale — there is no
  second way to take money in this app. `createSale` takes an optional `appointmentId` and links it
  with a compare-and-set **inside the sale's transaction** (`updateMany … where saleId: null`), so a
  booking paid twice rolls the whole second sale back instead of leaving the money behind.
- Someone with work still in the diary cannot be switched off until those bookings are moved.

Eighth — **memberships** (`MEMBERSHIPS`: salon, spa, gym):
- A `MembershipPlan` is sold **as an ordinary service item** (`variantId`), so joining is a normal
  POS sale — money, VAT, receipt and Finance all go through the one path. The plan only decides what
  the member gets: a period, optionally included sessions, optionally a member discount. A plan has
  to promise something, must be sold as a service, and one item sells one plan.
- Everything a member bought is **snapshotted** on `Membership`, so changing a plan never changes
  what someone already paid for. Buying again while still a member **extends** the end date and adds
  the sessions, rather than throwing away the days left.
- `lib/business/memberships.ts` decides entitlement; the till only *asks* (`useMembership` on the
  line). The server answers whether the plan covers that service, whether a session is left, and
  therefore what the line costs — a covered session is free, then the member discount applies, and
  anything uncovered is **refused** rather than quietly charged. Sessions are counted down across
  the cart, so two lines cannot spend the same one.
- Selling a plan needs a customer to credit it to, and that check lives **inside the sale's
  transaction**: refusing it rolls the whole sale back rather than leaving the money behind.
- `MembershipUse` ties sessions to the sale line that spent them. A void or a return gives them back
  **in proportion** (`returnedSessions`, like commission's `reversedAmount`) — returning one of a
  two-session line returns one session. Because a membership visit is worth 0, a return may carry
  **no refund rows at all**: the money check only asks for money when money is owed.
- Expiry is by date, swept by `refreshMembershipStatuses()` before reads, like the other status
  sweeps. Cancelling is a status change — never a delete — and anything owed is refunded at the till.

Ninth — **price lists** (`PRICE_LISTS`: wholesale, B2B):
- `lib/business/pricing.ts` holds the whole rule, in order: the highest **quantity break** the line
  reaches, else a fixed price on the list, else a percentage off the catalogue, else the catalogue.
  `PriceList` → `PriceListItem` → `PriceTier`, with `Customer.priceListId` saying who gets what.
- A customer with no list pays the **default** list (one list carries it, like the default branch);
  a withdrawn list puts its customers back on the default without editing any of them.
- **The till no longer asserts a price it was merely shown.** `unitPrice` is sent only when the
  cashier typed one — a manager discount — and otherwise the engine prices every line itself. The
  till asks `quotePrices` what to *display*, and the engine resolves it again when the sale is
  recorded, so the screen is never the authority.
- Quantity breaks must climb in quantity and get cheaper as they go; a break at 1 or below, two
  breaks at the same quantity, or an entry that prices nothing are all refused. Saving an empty
  entry **removes** it, which is how an item goes back to the catalogue price.
- Price lists live in the POS module, because that is where the capability lives. The commercial
  documents (quotations and invoices) keep catalogue prices with manual overrides; crossing that
  boundary would put one module's pricing inside another's forms.
- A Zod note worth keeping: in a `z.union`, put `z.null()` **first**. A coercing number schema turns
  `null` into `0`, which once priced a discount-only entry at nothing.

Tenth — the **advanced industries**: `WORK_ORDERS` (repair), `TICKETS` (cinema, venues), `ROOMS`
(hotels) and `RENTALS` (equipment). Engines in `lib/business/work-orders.ts`, `tickets.ts`,
`stays.ts`, `rentals.ts`; one shared `actions/industries.ts`, `lib/data/industries.ts` and
`lib/validation/industries.ts`. **None of them takes money** — every payment is an ordinary POS sale
linked to the thing it settles:
- **Work orders** are the *work*: taken in → looked at → quoted → approved → repaired → ready →
  handed back. Quoting needs a price (approval means approving a figure) and **nothing leaves
  unpaid**: `DELIVERED` is refused until a sale is linked. `createSale` takes `workOrderId` and
  links it with the same compare-and-set a booking uses, inside the sale's transaction.
- **Tickets**: places left is a **count of issued minus returned**, never a column anyone
  decrements, so a sale, a void and a return cannot disagree. `TicketIssued` hangs off the sale line;
  a void or return frees places in proportion. Whole places only, the event's own item only, and
  capacity may grow but never below what is sold.
- **Rooms**: a stay is a room between two dates, and the **folio is a held POS sale** pointing at it,
  so a minibar water and a night arrive by the same path and **check-out is settling a held bill** —
  `CHECKED_OUT` is refused as a click. Nights are hotel nights: the departure night is not charged,
  so a guest arriving on another's departure day is fine. The room's own charge needs a night item,
  which is how it reaches the catalogue and VAT.
- **Rentals**: stock leaves the shelf inside the same transaction that writes the agreement, with
  its own `RENTAL_OUT` / `RENTAL_IN` movement kinds — calling it a `SALE` would claim the kit was
  sold. Late days are counted from the due date (the due day itself is not late) and the fee is
  **charged at the till**, not minted here. Something written off as lost never returns to the shelf.
- Work orders, stays and rentals take numbers from the document sequence (`JOB`, `STAY`, `RNT`), so
  they are editable in Settings → Document Numbering like every other document.

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
  `PUBLIC_PATHS` needs no session; `ALLOWED_WITH_SESSION` is the subset a signed-in visitor is *not*
  bounced away from (`/reset-password`, because someone may be signed in elsewhere).
- **Password reset** uses BetterAuth's own flow — `sendResetPassword` / `onPasswordReset` configured in
  `lib/auth/auth.ts`, with `auth.api.requestPasswordReset` and `auth.api.resetPassword` behind the two
  public actions in `actions/auth.ts`. The token is random, single-use, stored in `Verification` as
  `reset-password:<token>` and lasts `PASSWORD_RESET_TOKEN_SECONDS` (1 hour, deliberately **not** a
  setting — lengthening it weakens the one credential that bypasses the password).
  - **The reply never reveals whether an address has an account.** Unknown, deactivated and
    throttled all return the same sentence; a send failure is swallowed and logged for the same
    reason. The only different answer is "email is not set up", which says nothing about any account.
  - A deactivated account gets no link: its password would be changeable while sign-in stays blocked.
  - `revokeSessionsOnPasswordReset` signs other devices out — otherwise resetting after a takeover
    leaves the intruder's session alive. A successful reset also clears the sign-in lockout.
  - The new password is checked against Settings → Security in the action, because BetterAuth only
    enforces a length. `User.passwordResetRequestedAt` throttles to one link a minute per account.
  - Email can be configured by the settings row **or** `SMTP_*` env vars (`getSmtpConfig` falls back),
    so "is email set up?" must always be asked via `isEmailConfigured()`, never by reading the row.
    With it unset the login screen offers no reset link and `/forgot-password` is `notFound()`.
- Settings: `lib/data/settings.ts` (singleton rows created lazily), option lists/defaults in `lib/settings/defaults.ts`.
  Formatting must go through `getFormatters()` (server) or `useFormat()` (client) so Date & Regional settings apply.
- Document numbers: `nextDocumentNumber(tx, type)` in `lib/business/numbering.ts`, always inside the creating transaction.
- Commercial documents (quotation / invoice / supplier quotation / purchase) share `components/documents/*`
  (form, view, line items, payment dialog, send dialog) configured by `document-kinds.ts`; totals in `lib/business/totals.ts`;
  statuses derived in `lib/business/sales-status.ts` / `procurement-status.ts` and persisted by `refreshInvoice` / `refreshPurchase`
  plus the `refresh*Statuses()` sweeps run before reads. PDFs: `lib/pdf/document-pdf.tsx` (generic) + per-module builders.
- Money in/out, profit, receivables/payables and account balances all come from `lib/business/finance.ts`
  (cash-based on payment/entry dates). Date-range presets live in `lib/date-range.ts` (shared client/server).
- **Receiving goods** (`lib/business/receiving.ts`) is the only way stock arrives from Procurement —
  before it, stock could only ever leave. A `PurchaseReceipt` (`GRN` number) records one delivery:
  which branch it landed in, what arrived, at what cost. Deliveries come in parts, so
  `PurchaseItem.receivedQuantity` caps receiving the way `returnedQuantity` caps returns.
  A purchase line becomes stock **only when it is linked to a catalogue item** — most purchases also
  carry rent, courier and fees, which are costs, not things on a shelf. The link is made in the
  receive dialog and remembered, so purchases already typed as free text can still be received.
  The cost recorded is the line's price **net of discount and excluding VAT** (VAT is recoverable, so
  it never belongs in a stock value); writing it onto the item is opt-in. Receiving needs
  **both modules**: `PROCUREMENT edit` and, because stock lives in POS, the POS module with
  `INVENTORY edit` — a Business-Management-only company keeps its purchases and is told plainly that
  there is no shelf. A receipt keyed in error is **cancelled**, which takes the stock back off as an
  `ADJUSTMENT` (not a `PURCHASE_RETURN` — nothing went back to the supplier) and frees the line again.
- **Credit notes** (`lib/business/credit-notes.ts`) are how an issued invoice is put right, because an
  issued invoice is never edited or deleted. Amounts are recomputed from the invoice's own lines by
  `calcLine` — never apportioned — so the VAT reverses exactly as it was charged, and
  `InvoiceItem.creditedQuantity` caps partial credits the way `PosSaleItem.returnedQuantity` does.
  A refund is a **negative `InvoicePayment` tagged with the note**, so money out uses the rows money
  came in on; a credit left on the account writes no payment row at all, because nothing moved.
  What a customer owes is `grandTotal − paidTotal − creditedTotal` everywhere (status, receivables,
  the overdue sweep), and an invoice settled by credit alone reads `CREDITED`, not `PAID`.
  Cancelling a note restores the balance and deletes its refund row; the record itself always stays.
  - A note may also carry **amount-based adjustments**: a goodwill discount agreed afterwards, a
    price corrected, a charge waived. Not everything put right is a quantity. An adjustment is
    priced as one unit at the amount through `calcLine` (so there is still one implementation of the
    arithmetic), carries **its own VAT rate** defaulted from the invoice, and the amount is **net**
    with VAT on top — as every other amount in the app is typed. `CreditNoteItem.invoiceItemId` was
    already nullable, so an adjustment needs no migration and consumes no `creditedQuantity`:
    **only the invoice's own total caps it**. Either list may be empty but not both, and that is the
    engine's sentence, because no single field is at fault.
- **Returning goods to a supplier** (`lib/business/purchase-returns.ts`) is how a *received*
  purchase is put right, and it is the only thing in the app that writes a `PURCHASE_RETURN` stock
  movement — a kind that sat in the schema and in the UI's labels while nothing ever produced one.
  It is the credit note read backwards, and borrows its two rules: amounts are recomputed from the
  purchase's own lines by `calcLine` so the VAT reverses exactly as it was charged, and money only
  moves if the supplier actually sends some, as a **negative `PurchasePayment` tagged with the
  return**. Credit left on the account writes no payment row: nothing moved, the business owes less.
  - **Only what arrived can go back.** `PurchaseItem.returnedQuantity` is capped by
    `receivedQuantity`, exactly as that is capped by the ordered quantity — returning what never
    turned up would take stock off a shelf it was never on. A purchase with nothing received is
    refused outright.
  - What is owed is `grandTotal − paidTotal − creditedTotal` everywhere (status, payables), and a
    purchase settled by goods alone reads **`CREDITED`**, never `PAID`: nothing was paid.
  - Cancelling puts everything back — the stock onto the shelf, the quantity onto the line, and the
    money row away again — because Finance reads those rows. The record itself always stays.
  - Needs **both modules**, like receiving and for the same reason: the paperwork is Procurement's,
    the shelf is POS's. A line that was never stock (rent, courier, a fee) still carries its credit.
  - It prints: `/api/procurement/returns/[id]/pdf`, the document that travels with the goods.
    **No ZATCA QR** — the QR is a seller's statement about tax they charged, and here the business
    is the buyer. The supplier issues the credit note; this is the buyer's own record.
  - A **missing document-type default** is what this feature tripped over: `nextDocumentNumber`
    falls back to `DOCUMENT_TYPES` the first time a type is used, so a type absent from that list
    throws in front of a customer rather than at build time. `document-types.test.ts` now checks
    the list against the Prisma enum, both ways, and that no two types share a prefix.
- **Customer advances** (`lib/business/advances.ts`) are money taken before there is an invoice to
  put it against — a deposit on an order, a retainer, payment up front. One rule carries the feature:
  **the cash arrives once, so Finance counts it once.**
  - The `CustomerAdvance` row **is** the money-in event, on the day the money arrived. Applying it
    to an invoice moves nothing: it only decides what the money settles. So an application writes an
    `InvoicePayment` tagged `customerAdvanceId`, and Finance **excludes** those rows (`CASH_PAYMENTS`
    in `lib/business/finance.ts`). Forget that filter and the same riyal shows as income twice and
    every bank balance is overstated by the value of every deposit ever taken.
  - That filter belongs on **every** read of `invoicePayment` that means "money in":
    `getFinanceTotals`, `getAccountBalances` and `listIncomeEntries`. `refreshInvoice` is the
    exception and must *not* filter — the invoice really is paid by that money.
  - Giving unused money back is `CustomerAdvanceRefund`, **its own row on its own date**, because
    Finance is cash-based: money in one month and out the next is two events, not a smaller one.
  - One customer's deposit can never settle another's bill; a draft invoice cannot be settled from
    one; and an advance that is settling an invoice cannot be cancelled until it is taken off it.
    Taking an application back returns the money to the advance, not to the customer — nothing left.
  - Cancelling withdraws the income (like cancelling a goods receipt withdraws the stock); the
    record stays. `advanceBalance()` lives in the client-safe `advance-balance.ts` because the
    refusals and the screen must quote the same figure.
  - Permission is `SALES`, the same as recording a payment: this is that job done earlier. The UI is
    an **Advances** tab on the customer.
- **Supplier prepayments** (`lib/business/supplier-advances.ts`) are the same feature read
  backwards: money paid before there is a bill. **The cash leaves once, so Finance counts it once.**
  - `SupplierAdvance` is the money-out event on the day the money left. Applying it to a purchase
    writes a `PurchasePayment` tagged `supplierAdvanceId`, and Finance **excludes** those rows
    (`CASH_SUPPLIER_PAYMENTS`). Forget that filter and the same riyal is an expense twice and every
    bank balance is understated by every deposit ever paid. It belongs on every read of
    `purchasePayment` that means "money out": `getFinanceTotals`, `getAccountBalances` and
    `listExpenseEntries`. `refreshPurchase` is the exception and must *not* filter — the purchase
    really is paid by that money.
  - Money the supplier sends back is `SupplierAdvanceRefund`, its own row on its own date, and it
    appears in **money out as a negative** rather than as income: it reverses an expense already
    recorded, and putting it under money-in would make both columns bigger than the business traded.
  - Permission is `PROCUREMENT`, and the UI is a **Prepayments** tab on the supplier. The card
    itself is shared with the customer side (`components/parties/party-advances.tsx`, configured by
    `party-advances-config.ts`), because the two are one screen read in opposite directions — the
    same approach `components/documents/*` takes. `advanceBalance()` is already party-agnostic.
  - The engine is a parallel file rather than a generic one, like `sales.ts` / `procurement.ts`:
    the refusals name purchases and suppliers, and one function pretending to do both would read
    worse than two that each say what they mean.
- **The VAT return** (`lib/business/vat-return.ts`, arithmetic in the client-safe `vat-totals.ts`)
  totals VAT charged on sales against VAT paid on purchases for a period. Everything it needs was
  already recorded; nothing added it up.
  - **It is the one report in the app that is not cash-based.** Money in, money out, profit and the
    account balances all follow *payment* dates. VAT follows the **document's own date** — the tax
    point — so an invoice issued in March belongs to March's return whether or not it has been
    paid. Reading it as if it were the Finance screens would understate a quarter by every unpaid
    invoice in it, so `/finance/vat` says which basis it is on rather than leaving it assumed.
  - What counts: issued invoices and non-void, non-held POS sales, **less** credit notes and POS
    returns; received purchases, **less** goods sent back. A draft is not a tax document and a
    purchase that has not arrived is not reclaimable — both are excluded, and
    `tests/engines/vat-return.test.ts` pins exactly that, because a draft on a return is a filing
    error that looks like an ordinary number.
  - **A general expense can carry VAT too.** `Expense.amount` keeps its meaning exactly — what
    was paid, VAT included, which is what money-out counts — and `vatRate`/`vatAmount` say how
    much of it was tax. Rent, couriers and fees are bought on tax invoices like anything else, and
    leaving them out understated the reclaim every quarter. The rate defaults to 0, because it
    should only be set where the supplier actually gave a tax invoice, and the form says so.
  - `vatFromGross` in `totals.ts` does that split, and is the **only** place in the app that works
    backwards from a VAT-inclusive figure: everything else is typed net with VAT added. The net is
    derived and the VAT is the remainder, never the reverse, so `net + vat` is *exactly* what left
    the bank and no rounding tail can open up between the halves.
  - It is **not** called a filing and makes no compliance claim: it totals what the business
    recorded, and what belongs on each line of ZATCA's form is for the business and its accountant.
- **Customer statements** (`lib/business/statement.ts` for the arithmetic, `lib/data/statements.ts`
  for the rows, `/api/customers/[id]/statement` for the PDF) are the document a business sends when
  it wants paying. Receivables said *how much* and aging said *how old*; neither said **why**, and
  a figure without its workings starts an argument rather than ending one.
  - Balance = invoices − payments − credit notes, and **one sign rule does all three**: a payment's
    amount may itself be negative, which is how a refund is stored, and it then correctly puts the
    money back on the account. No special case per kind.
  - Same-day movements are ordered **invoice first**. Sorted the other way a bill raised and paid
    on one day shows a credit balance the customer never had, and somebody queries it.
  - It opens with the balance **brought forward**, counted the same way over everything dated
    earlier, so a statement starts where the last one closed rather than pretending the account
    began this month. Drafts are excluded: nobody has been billed for them.
  - The PDF reuses the ordinary document table with its columns renamed (`PdfDocumentData.columns`),
    so the branding, layout and page breaks are the ones every other document already has. A
    renamed column carries no Arabic twin, because it is not one of ZATCA's terms — and a statement
    gets no QR either, being a summary of invoices rather than one.
- **How old the money is** (`lib/business/aging.ts`, pure and client-safe) buckets receivables and
  payables into not-yet-due / 1–30 / 31–60 / 61–90 / over 90, shown above both lists. "Someone owes
  40,000" and "someone has owed 40,000 since June" are different conversations and only one of them
  gets anybody paid. The boundaries are pinned exactly, including the rule the rest of the app
  already follows — **the due date itself is not late**.
- **What the stock is worth** (`getStockValuation` in `lib/data/items.ts`) sits above the stock
  list. Its own query, not a total of the rows on screen: that table is paginated, so summing
  twenty-five rows and calling it the stock value would be wrong by everything on page two. Valued
  at **cost**, with the variant's cost beating the item's — the same rule a sale uses, so a line's
  margin and this total agree.
- **What sold** (`lib/data/pos-reports.ts`, `/pos/reports`) groups every till line by item and by
  category: quantity, net sales, cost, profit and margin. **Net of returns and excluding VAT**,
  because that is what the shop keeps, and margin comes from the cost **snapshotted on the line**,
  so changing a cost price today never rewrites what last month made. Margin on nothing sold is
  `null`, shown as "—": "0%" would be a claim.
- `StatCards` takes `as: "number"` for a count. Everything on those cards was rendered through
  `format.money`, so "Customers with balance" read **SAR 3.00** until somebody looked.
- **Saudi e-invoicing** (`lib/zatca/*`) — ZATCA **Phase 1 ("Generation") only**. The settings
  screen no longer explains what Phase 2 would involve — a customer does not need the roadmap —
  but it still makes **no compliance claim**: one line tells them to confirm their wave and
  obligations with ZATCA or their accountant, and nothing on the screen says more than the app
  does. Phase 2 ("Integration": signed UBL 2.1 XML, the invoice hash chain, a
  certificate from the Fatoora portal, clearance for B2B and 24-hour reporting for B2C) is **not
  built**; `ZatcaMode` therefore has only `OFF` and `PHASE_1`, because offering a mode that does
  nothing would be a lie to the user. **Never claim compliance** — that is settled by ZATCA's own
  checks against a real certificate, not by this code.
  - `lib/zatca/qr.ts` is the QR: not a URL but **base64 over TLV records** (tag, byte length, value),
    five of them in Phase 1 — seller name, VAT number, timestamp, total with VAT, VAT. Pure and
    client-safe, with its own base64 so it runs in the browser and on the server alike. The length
    byte counts **bytes, not characters** (Arabic costs two per letter), and a TLV length is one
    byte, so an over-long value is cut on a character boundary rather than mid-letter.
  - `lib/zatca/qr-image.ts` turns a payload into one SVG path. The server renders the path, so the
    QR encoder never reaches the browser bundle and the PDF and the 80 mm receipt draw the same code.
  - `lib/data/zatca.ts` (`zatcaStamp`) is what every outgoing document asks for: the title in both
    languages and the QR, built **server-side from the stored document** — the QR is a statement to
    the tax authority about what was charged, so it is never built from anything the browser sent.
    It returns **null when the mode is OFF**, which is what leaves every other deployment untouched.
  - Standard (B2B) against simplified (B2C) is decided by the **buyer's** VAT number
    (`documentKindFor`), never by who typed the document. A till receipt is a simplified invoice,
    which is the kind that must carry the QR. The distinction is drawn now because Phase 2 routes
    the two differently.
  - The seller's details are checked **when the mode is switched on**, not when a document prints:
    a QR built from half-filled settings scans perfectly and states the wrong thing. So
    `sellerProblems()` gates the switch and the till is never blocked afterwards. Switching **off**
    is always allowed.
  - Arabic needs a real font: react-pdf's built-ins have no Arabic glyphs, and Arabic must be
    *shaped* (letters change form by position) via the font's GSUB table. Amiri is bundled in
    `assets/fonts` (OFL-1.1) and registered by `lib/pdf/fonts.ts` **only when a document needs it**.
    With e-invoicing on, that font takes over the whole document rather than being mixed in.
  - `npm test` (Node's own runner, no new dependency) covers the TLV bytes, the base64 against
    `Buffer` as an independent oracle, the truncation boundary, and the seller rules — this is code
    whose output no one can check by eye.
- **CSV export** (`lib/export/csv.ts` + `actions/export.ts` + `components/shared/export-button.tsx`)
  — one mechanism, wired into the list toolbars for invoices, quotations, purchases, customers,
  suppliers, POS sales and stock. An export answers **the question the screen is asking**: the
  button posts the page's own query string, so the file carries the same search and filter but
  **every** page, not the twenty-five on display. `ListParams.pageSize` is what widens the window;
  it is set only by an export, so every list screen stays paginated as before.
  - Each action authorises exactly what its page requires — a bulk read is never a weaker check, and
  a switched-off module closes the export just as it closes the screen.
  - Three details decide whether a file opens correctly, and each is easy to miss:
    a **UTF-8 byte-order mark** (without it Excel renders Arabic names as mojibake);
    **formula neutralisation** — Excel executes a cell starting `=`, `+`, `-`, `@`, tab or CR, and
    quoting does *not* prevent it, so such text is prefixed with `'`; and **numbers and dates as
    data** — plain decimals and `YYYY-MM-DD`, never grouped or localised, so a spreadsheet can sum
    and sort them. Display formatting belongs on screen.
  - Only **strings** are neutralised. A number is ours, not input, and `-50` begins with a character
    Excel would execute — neutralising it indiscriminately turned every refund into text and stopped
    the column adding up. A test caught that; keep it.
  - Too many rows is **refused, never truncated** (`CSV_ROW_LIMIT`), because a short file that looks
  complete is the worst outcome. Nothing matching gives a headings-only file, not an empty one.
- A failed action's `fieldErrors` are shown, not swallowed: `actionErrorLines()` in `lib/action-error.ts`
  turns a result into the real messages, because "check the highlighted fields" is useless in a
  dialog that highlights nothing.
- Visual language (`app/globals.css`): cool grey canvas + white elevated cards (`--shadow-card`), radius `0.75rem`,
  and a tint palette (`--tint-blue|green|amber|red|purple` + `-foreground`) used for icon tiles and status pills.
  Use `StatCards` (icon tile + trend), `StatusBadge` tones, and `Card`/`Button` defaults rather than bespoke styling.
- **Printing hides the shell, piece by piece.** Every printable screen sits inside the
  authenticated layout, so pressing print put the sidebar, the header and whichever banners were
  showing onto the paper beside the receipt. Each one now carries its own `print:hidden`, and
  `<main>` carries `print:p-0`.
  - The first attempt was cleverer and shipped broken: hide everything with
    `visibility: hidden`, then show `main, main *`. **shadcn's `SidebarInset` is itself a
    `<main>`**, and it wraps the header and the banners — so that selector put the entire shell
    back, and lifting the inner `<main>` out of the flow drew the receipt on top of it. Two
    `<main>` elements on a page is not a thing to assume away.
  - The **sidebar** is the one piece that cannot be labelled from our own code: a `className`
    passed to `Sidebar` lands on its inner container, while the wrapper also holds a
    `sidebar-gap` spacer reserving the sidebar's width — hide the container alone and the
    receipt prints pushed a sidebar to the right, which reads as a margin bug. It is hidden by
    its documented `data-slot="sidebar"`, with `!important`, because the wrapper carries
    `md:block` and paper is wide enough to count as `md`.
  - A **new bar added to the shell must be given `print:hidden`**, which is the cost of being
    explicit and the reason this note exists.
  - `@page` is deliberately left alone: the till receipt is 80 mm and everything else that
    prints is a server-rendered PDF, so there is no one page size to set.
  - The till receipt (`/pos/sales/[id]/receipt`) opens in its own tab and calls `window.print()`
    itself, so no dialog is ever open when this applies.
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
- A feature belongs to exactly one module. Gate it with the module guards; hiding navigation is never
  the check. POS industry differences are capabilities, never `if (businessType === …)`.
- Every company-owned row carries `companyId` and is filtered automatically — see **Multi-tenancy**.
  Never add a `companyId` condition by hand to a Prisma query; do add one to hand-written SQL.
- The status a person may pick comes from the `*Transitions()` helpers in `lib/business/*-status.ts`, shown by
  `components/shared/status-menu.tsx` in list tables; the Server Action re-checks the same rule.

## Checks
`npm run typecheck` · `npm run lint` · `npm run build` — all must pass before a phase is considered done.
`npm test` runs the unit tests (Node's built-in runner via tsx, no new dependency, `lib/**/*.test.ts`).

`npm test` runs **two passes**, and they are separate for a reason:

- `npm run test:unit` — the pure modules (`lib/**/*.test.ts`), fast, no database.
- `npm run test:engines` — the money engines against a **real Postgres** (`tests/engines/**`).
  Needs `--conditions=react-server` so `server-only` resolves to its no-op; that same condition
  gives React its *server* build, which has no `createContext`, so anything importing a component
  (lucide icons, `nav-config`) must stay in the unit pass. That is why they are two commands.

**The engine tests run in their own Postgres schema inside the same database.** `npm run db:test:setup`
creates `bighawk_test` and applies every migration to it; `DATABASE_SCHEMA` then points the whole app
at it, so the engines run unmodified and real data in `public` is never touched. Unset, the engine
tests **skip with a reason** rather than fail.

Three details in `lib/db.ts` had to be right, and each was found the hard way:

- **Two things must be told about the schema.** `{ schema }` qualifies the SQL Prisma generates;
  `search_path` qualifies the SQL **we** write. Without the second, a `$queryRaw` (numbering's
  `FOR UPDATE`, the overdue sweep) resolves against `public` whatever Prisma was told — the tests
  would have read and written production through the numbering lock.
- **`search_path` is a startup parameter on a direct connection**, not a `SET` on a pooled one.
  Neon's pooled endpoint rejects `options`, so the obvious fallback is `pool.on("connect")` — and
  that *measurably* loses a race: under concurrency a query reaches a new connection before its
  `SET` has run, reads `public`'s numbering row, then fails to update a row that was never in this
  schema. Measured over three runs it failed 8, 1 and 1 times; the startup parameter, four runs
  clean. So the pooled host is swapped for the direct one (`-pooler.` → `.`).
- **The direct endpoint needs a small pool** (`max: 4`). It is not built for a burst of sockets the
  way the pooler is, and five at once gave "Can't reach database server".

`public` is deliberately left out of the search path, so a table the test schema is missing fails
loudly instead of quietly finding production's. The engine files share **one process**
(`--test-isolation=none`) so they cannot truncate each other mid-transaction — which also means a
file must not close the pool in its own `after`; `closePoolAtExit()` does it once, at the end.

**What is tested, and why those things.** The engines are covered by the pass above — the till
(server-side pricing, stock moving with the money, takings reaching Finance, refusals rolling the
whole sale back, numbering under concurrency, and an offline sale replayed twice recording once),
returns (negative payment rows, restock against write-off, the `returnedQuantity` cap), goods
going back to a supplier (stock and money moving together, the received cap, `CREDITED` never
reading as `PAID`), advances
and supplier prepayments (the cash counted once, in each direction) and **two companies in one database** (`tests/engines/tenancy.test.ts`).
That last file is the only one that would notice the tenant filter being switched off: every other
suite runs as a single company and would pass just as happily without it. It asks whether one
customer can read or write another's rows by id, and whether both can hold POS-2026-0001 — half
the answer is the foreign keys and the per-company unique indexes, neither of which exists in
TypeScript. The pure side is chosen by blast radius:
- `lib/business/totals.ts` — the money core. Every document's figures come through it, so a wrong
  rounding step is wrong everywhere at once. Pinned: VAT is charged on the **discounted** amount;
  `round2` rounds a half *up* (naive `Math.round(1.005*100)/100` loses a halala);
  `vatFromGross` always adds back to exactly what was paid, and agrees with `calcLine` in the
  other direction; and
  **the grand total equals the sum of its lines**, which is what lets a POS receipt and an invoice
  for identical lines agree — it holds only because totals are summed from already-rounded lines.
- `lib/business/scale-barcode.ts` — its failure mode is *nothing happening*: a layout that does not
  match the shop's scale never matches a scan and nobody can tell why. Includes the invariant that
  the settings screen's own worked example is something the parser accepts.
- `lib/business/sales-status.ts` / `procurement-status.ts` — a status is never typed in. Pinned:
  settled by credit alone reads `CREDITED`, never `PAID`; the due date itself is not yet overdue; and
  a `*Transitions()` helper never offers a derived status, since the action would only refuse it.
- `lib/platform/modules.ts` / `pos-types.ts` — these gate authorization, and a missing row does not
  throw, it quietly grants or withholds. Both registries are checked against the **Prisma enums**, so
  adding a `PermissionModule` without an owning `AppModule` (which would leave it reachable with
  every module off) or a `PosBusinessType` without a row (`posTypeInfo` silently falls back to the
  *last* row) fails the suite.
- `lib/zatca/*` — output no one can check by eye: TLV bytes, base64 against `Buffer` as an
  independent oracle, the 255-byte truncation boundary, and the seller rules.
- `lib/business/statement.ts` — the document that chases money, so a wrong balance is an
  argument with a customer. Pinned: the brought-forward balance, invoice-before-payment on the
  same day, and a refund raising the balance rather than lowering it.
- `lib/platform/tenant-host.ts` — decides whose login screen a stranger sees. Pinned: every
  uncertain case comes back null, including a `Host` header pointing somewhere else entirely,
  which is attacker-controlled behind a misconfigured proxy.
- `lib/business/aging.ts` — which bucket a debt falls in decides who gets chased. Pinned: every
  boundary exactly, the due date not counting as late, and the buckets summing to the total beside
  them.
- `lib/business/vat-totals.ts` — figures that go on a filing. Pinned: credits come **off** (the
  sign is the whole risk), zero-rated still counts towards the net, and a period can be negative.
- `public/sw.js` — what a till keeps on a shared device, and what it must never keep. Pinned:
  a non-GET, the API, an RSC fetch and any route but the till are all passed through untouched;
  a redirected response is not stored; and a failed fetch falls back to the kept page. None of
  those mistakes shows up on screen.
- `tests/engines/operator.test.ts` — what BigHawk's own operator may do inside a customer's
  company, and what that customer is shown. Both failure modes are silent: a customer reading a
  stranger's name in their own activity log, and a seat limit that has quietly stopped counting.
  Pinned: the operator's entry is hidden from the customer but still filed against them, the
  filtered total matches the filtered list, a deactivated user frees their seat, a limit lowered
  past current usage reports nothing left rather than a negative, and one customer filling up
  never refuses another's staff.
- `lib/platform/user-scope.ts` — `User` is outside the tenant filter, so every one of its
  failure modes is silent and none of them is visible on a single-customer deployment: a list
  that spans customers, a created account belonging to nobody, a notification emailed to the
  wrong company's staff. The test reads the source, because no engine test running as one
  company could tell the difference.
- `lib/db/tenant-filter.ts` / `tenant-models.ts` — the tenant filter narrows every query in the
  app, and both of its failure modes are silent: a model missing from the registry is read across
  every customer, and a `where` narrowed wrongly returns nothing with no error to follow. The
  registry test re-reads `schema.prisma`, so the list cannot drift from the database.
- `lib/dates.ts`, `lib/decimal.ts`, `lib/business/document-number.ts`, `lib/action-error.ts` — small
  and used everywhere, so a quiet change moves dates, money or document numbers app-wide.

**Green tests are not the same as a working app.** Multi-tenancy passed every suite while the
running app still served one customer another's rows: under `tsx` the two import specifiers for
the scope store resolved to one module, and under the bundler they did not. It was found by
loading real pages against the real database. Anything that depends on module identity, bundling
or the request lifecycle has to be checked that way before it is called done.

**And a 200 is not proof a page rendered.** The same work shipped a second bug — request code
reading the scope store, which a request never fills — that threw on the dashboard and on every
document number. A sweep of those pages had been run and reported `200` for all of them, because
the status line says nothing about what the body contains.

**How to actually tell.** Searching the HTML for error *text* does not work either — it was tried,
and the broken page contained none of it. What a failed server render does leave is a **`digest`**
in the RSC payload; a healthy page has none. Two of those are deliberate and must be ignored:
`NEXT_REDIRECT` (a `redirect()`, as `/finance` does) and `NEXT_NOT_FOUND`. Anything else — a bare
numeric hash — is a page that threw. Validate the detector by reintroducing a known bug before
trusting a clean sweep, because two plausible detectors in a row reported everything healthy while
the dashboard was broken. And exercise a **write** as well as a read: they break differently.

Tests assert behaviour that would be *wrong* if changed, not whatever the code currently returns.
The suite is mutation-checked: breaking VAT-on-discount or the scale factor must turn it red.
Note `git checkout <file>` cannot restore an **untracked** file — most of `lib/business` is still
untracked, so copy a file aside before deliberately breaking it.
