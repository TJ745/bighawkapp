-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'GOODS_RECEIPT';

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "receivedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" DATE NOT NULL,
    "status" "PurchaseReceiptStatus" NOT NULL DEFAULT 'ISSUED',
    "note" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "receivedById" TEXT,
    "receivedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_number_key" ON "PurchaseReceipt"("number");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseId_idx" ON "PurchaseReceipt"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_branchId_receivedAt_idx" ON "PurchaseReceipt"("branchId", "receivedAt");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_status_idx" ON "PurchaseReceipt"("status");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_receiptId_idx" ON "PurchaseReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "PurchaseItem_variantId_idx" ON "PurchaseItem"("variantId");

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

