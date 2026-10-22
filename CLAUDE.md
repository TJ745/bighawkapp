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
- Settings → Modules (Super Admin) switches modules and sets each branch's industry;
  Settings → Branches (SETTINGS permission) is branch CRUD.
- Consequential changes are recorded with `recordAudit()` (`lib/platform/audit.ts`).

## Catalogue & inventory (POS module)
- `Item` covers **products and services**; stock always hangs off an `ItemVariant`, so an item sold
  in one form still has a single default variant. Nothing special-cases "product without variants".
- **`lib/business/inventory.ts` is the only place a stock level may be written.** Callers use
  `applyStockMovement` (inside their own transaction), or `setStockLevel` / `adjustStock` /
  `transferStock`. Each writes the level and the `StockMovement` that explains it together, so every
  quantity can be traced. Never update `StockLevel` directly — that is how stock and history drift.
- Quantities are `Decimal(14,3)` (weighed goods); money stays `Decimal(14,2)`. Going below zero is
  refused unless the caller passes `allowNegative`.
- Permissions: `POS` = selling at the till, `INVENTORY` = maintaining the catalogue and stock. A
  cashier has POS without INVENTORY.
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
- **Saudi e-invoicing** (`lib/zatca/*`) — ZATCA **Phase 1 ("Generation") only**, and the app says so
  on its own settings screen. Phase 2 ("Integration": signed UBL 2.1 XML, the invoice hash chain, a
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
- One company per deployment today: platform models carry no `companyId` yet. Add it to every model in
  the platform section plus the business tables when multi-tenancy lands — do not fake it earlier.
- The status a person may pick comes from the `*Transitions()` helpers in `lib/business/*-status.ts`, shown by
  `components/shared/status-menu.tsx` in list tables; the Server Action re-checks the same rule.

## Checks
`npm run typecheck` · `npm run lint` · `npm run build` — all must pass before a phase is considered done.
`npm test` runs the unit tests (Node's built-in runner via tsx, no new dependency, `lib/**/*.test.ts`).

**What is tested, and why those things.** Only the **pure** modules — anything importing `lib/db` is
verified against the live database instead (a temporary `app/api/zz-*` route, deleted after the run),
because mocking Prisma would test the mock. The pure side is chosen by blast radius:
- `lib/business/totals.ts` — the money core. Every document's figures come through it, so a wrong
  rounding step is wrong everywhere at once. Pinned: VAT is charged on the **discounted** amount;
  `round2` rounds a half *up* (naive `Math.round(1.005*100)/100` loses a halala); and
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
- `lib/dates.ts`, `lib/decimal.ts`, `lib/business/document-number.ts`, `lib/action-error.ts` — small
  and used everywhere, so a quiet change moves dates, money or document numbers app-wide.

Tests assert behaviour that would be *wrong* if changed, not whatever the code currently returns.
The suite is mutation-checked: breaking VAT-on-discount or the scale factor must turn it red.
Note `git checkout <file>` cannot restore an **untracked** file — most of `lib/business` is still
untracked, so copy a file aside before deliberately breaking it.
