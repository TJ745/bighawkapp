-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'CREDIT_NOTE';

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'CREDITED';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "creditedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "creditedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "creditNoteId" TEXT;

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "internalNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceItemId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineDiscount" DECIMAL(14,2) NOT NULL,
    "lineVat" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_customerId_idx" ON "CreditNote"("customerId");

-- CreateIndex
CREATE INDEX "CreditNote_date_idx" ON "CreditNote"("date");

-- CreateIndex
CREATE INDEX "CreditNote_status_idx" ON "CreditNote"("status");

-- CreateIndex
CREATE INDEX "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

