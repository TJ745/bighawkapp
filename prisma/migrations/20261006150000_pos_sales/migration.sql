-- CreateEnum
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('PARKED', 'COMPLETED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PosPaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PosCashMovementKind" AS ENUM ('CASH_IN', 'CASH_OUT');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'POS_SALE';

-- CreateTable
CREATE TABLE "PosRegister" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cashAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openedById" TEXT,
    "openedByName" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingCash" DECIMAL(14,2),
    "expectedCash" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "closedById" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCashMovement" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "kind" "PosCashMovementKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "registerId" TEXT,
    "shiftId" TEXT,
    "customerId" TEXT,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" DATE NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "changeDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cartDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "refundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "cashierId" TEXT,
    "cashierName" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedByName" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
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
    "movedStock" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosPayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PosPaymentMethod" NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosRegister_branchId_isActive_idx" ON "PosRegister"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PosRegister_branchId_name_key" ON "PosRegister"("branchId", "name");

-- CreateIndex
CREATE INDEX "PosShift_branchId_openedAt_idx" ON "PosShift"("branchId", "openedAt");

-- CreateIndex
CREATE INDEX "PosShift_registerId_status_idx" ON "PosShift"("registerId", "status");

-- CreateIndex
CREATE INDEX "PosCashMovement_shiftId_idx" ON "PosCashMovement"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_number_key" ON "PosSale"("number");

-- CreateIndex
CREATE INDEX "PosSale_branchId_soldAt_idx" ON "PosSale"("branchId", "soldAt");

-- CreateIndex
CREATE INDEX "PosSale_date_idx" ON "PosSale"("date");

-- CreateIndex
CREATE INDEX "PosSale_shiftId_idx" ON "PosSale"("shiftId");

-- CreateIndex
CREATE INDEX "PosSale_status_idx" ON "PosSale"("status");

-- CreateIndex
CREATE INDEX "PosSale_customerId_idx" ON "PosSale"("customerId");

-- CreateIndex
CREATE INDEX "PosSaleItem_saleId_idx" ON "PosSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "PosSaleItem_variantId_idx" ON "PosSaleItem"("variantId");

-- CreateIndex
CREATE INDEX "PosPayment_saleId_idx" ON "PosPayment"("saleId");

-- CreateIndex
CREATE INDEX "PosPayment_date_idx" ON "PosPayment"("date");

-- CreateIndex
CREATE INDEX "PosPayment_paymentAccountId_idx" ON "PosPayment"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "PosRegister" ADD CONSTRAINT "PosRegister_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRegister" ADD CONSTRAINT "PosRegister_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

