-- Supplier prepayments: money paid before there is a bill to put it against.
--
-- The mirror of customer advances, and it carries the same single rule: the cash leaves **once**,
-- so Finance counts it once. The `SupplierAdvance` row is the money-out event; applying it to a
-- purchase writes a `PurchasePayment` tagged with it, and Finance skips those rows. Without that
-- tag the same riyal would be counted as an expense twice and every bank balance would be
-- understated by the value of every deposit ever paid.

-- CreateEnum
CREATE TYPE "SupplierAdvanceStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'SUPPLIER_ADVANCE';

-- AlterTable
ALTER TABLE "PurchasePayment" ADD COLUMN     "supplierAdvanceId" TEXT;

-- CreateTable
CREATE TABLE "SupplierAdvance" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "appliedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SupplierAdvanceStatus" NOT NULL DEFAULT 'OPEN',
    "paymentAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SupplierAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAdvanceRefund" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SupplierAdvanceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierAdvance_supplierId_idx" ON "SupplierAdvance"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierAdvance_paymentAccountId_idx" ON "SupplierAdvance"("paymentAccountId");

-- CreateIndex
CREATE INDEX "SupplierAdvance_date_idx" ON "SupplierAdvance"("date");

-- CreateIndex
CREATE INDEX "SupplierAdvance_status_idx" ON "SupplierAdvance"("status");

-- CreateIndex
CREATE INDEX "SupplierAdvance_companyId_idx" ON "SupplierAdvance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAdvance_companyId_number_key" ON "SupplierAdvance"("companyId", "number");

-- CreateIndex
CREATE INDEX "SupplierAdvanceRefund_advanceId_idx" ON "SupplierAdvanceRefund"("advanceId");

-- CreateIndex
CREATE INDEX "SupplierAdvanceRefund_paymentAccountId_idx" ON "SupplierAdvanceRefund"("paymentAccountId");

-- CreateIndex
CREATE INDEX "SupplierAdvanceRefund_date_idx" ON "SupplierAdvanceRefund"("date");

-- CreateIndex
CREATE INDEX "SupplierAdvanceRefund_companyId_idx" ON "SupplierAdvanceRefund"("companyId");

-- CreateIndex
CREATE INDEX "PurchasePayment_supplierAdvanceId_idx" ON "PurchasePayment"("supplierAdvanceId");

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_supplierAdvanceId_fkey" FOREIGN KEY ("supplierAdvanceId") REFERENCES "SupplierAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAdvance" ADD CONSTRAINT "SupplierAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAdvanceRefund" ADD CONSTRAINT "SupplierAdvanceRefund_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "SupplierAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAdvanceRefund" ADD CONSTRAINT "SupplierAdvanceRefund_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAdvanceRefund" ADD CONSTRAINT "SupplierAdvanceRefund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

