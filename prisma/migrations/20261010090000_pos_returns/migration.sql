-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'POS_RETURN';

-- AlterTable
ALTER TABLE "PosPayment" ADD COLUMN     "returnId" TEXT;

-- AlterTable
ALTER TABLE "PosSaleItem" ADD COLUMN     "returnedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PosReturn" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "registerId" TEXT,
    "shiftId" TEXT,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineSubtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosReturn_number_key" ON "PosReturn"("number");

-- CreateIndex
CREATE INDEX "PosReturn_saleId_idx" ON "PosReturn"("saleId");

-- CreateIndex
CREATE INDEX "PosReturn_branchId_returnedAt_idx" ON "PosReturn"("branchId", "returnedAt");

-- CreateIndex
CREATE INDEX "PosReturn_date_idx" ON "PosReturn"("date");

-- CreateIndex
CREATE INDEX "PosReturn_shiftId_idx" ON "PosReturn"("shiftId");

-- CreateIndex
CREATE INDEX "PosReturnItem_returnId_idx" ON "PosReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "PosReturnItem_saleItemId_idx" ON "PosReturnItem"("saleItemId");

-- CreateIndex
CREATE INDEX "PosPayment_returnId_idx" ON "PosPayment"("returnId");

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PosReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturnItem" ADD CONSTRAINT "PosReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "PosReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturnItem" ADD CONSTRAINT "PosReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturnItem" ADD CONSTRAINT "PosReturnItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

