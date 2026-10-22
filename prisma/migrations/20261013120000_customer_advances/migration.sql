-- CreateEnum
CREATE TYPE "CustomerAdvanceStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'CUSTOMER_ADVANCE';

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "customerAdvanceId" TEXT;

-- CreateTable
CREATE TABLE "CustomerAdvance" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "appliedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CustomerAdvanceStatus" NOT NULL DEFAULT 'OPEN',
    "paymentAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAdvanceRefund" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "reference" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAdvanceRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAdvance_number_key" ON "CustomerAdvance"("number");

-- CreateIndex
CREATE INDEX "CustomerAdvance_customerId_idx" ON "CustomerAdvance"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAdvance_paymentAccountId_idx" ON "CustomerAdvance"("paymentAccountId");

-- CreateIndex
CREATE INDEX "CustomerAdvance_date_idx" ON "CustomerAdvance"("date");

-- CreateIndex
CREATE INDEX "CustomerAdvance_status_idx" ON "CustomerAdvance"("status");

-- CreateIndex
CREATE INDEX "CustomerAdvanceRefund_advanceId_idx" ON "CustomerAdvanceRefund"("advanceId");

-- CreateIndex
CREATE INDEX "CustomerAdvanceRefund_paymentAccountId_idx" ON "CustomerAdvanceRefund"("paymentAccountId");

-- CreateIndex
CREATE INDEX "CustomerAdvanceRefund_date_idx" ON "CustomerAdvanceRefund"("date");

-- CreateIndex
CREATE INDEX "InvoicePayment_customerAdvanceId_idx" ON "InvoicePayment"("customerAdvanceId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_customerAdvanceId_fkey" FOREIGN KEY ("customerAdvanceId") REFERENCES "CustomerAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvanceRefund" ADD CONSTRAINT "CustomerAdvanceRefund_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "CustomerAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvanceRefund" ADD CONSTRAINT "CustomerAdvanceRefund_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

