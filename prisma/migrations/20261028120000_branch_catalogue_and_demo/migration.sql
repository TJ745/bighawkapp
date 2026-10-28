-- Two unrelated columns, one migration, because they ship together.

-- 1. Which branch sells an item. NULL means every branch, which is what every existing row is:
-- until now the till showed a company's whole catalogue whatever branch it was on, so a company
-- running a restaurant and a salon had hairdressing on the restaurant screen.
ALTER TABLE "Item" ADD COLUMN "branchId" TEXT;

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The till reads this on every keystroke, so it is indexed.
CREATE INDEX "Item_branchId_idx" ON "Item"("branchId");

-- 2. A demonstration company. It must never send email: the SMTP settings fall back to the
-- deployment's own, so a prospect could otherwise post real mail from our server to any address
-- they typed. It is also the only thing the nightly reset may delete.
ALTER TABLE "Company" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
