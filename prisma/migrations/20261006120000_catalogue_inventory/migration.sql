-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('OPENING', 'PURCHASE_RECEIPT', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'INVENTORY';

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "kind" "ItemKind" NOT NULL DEFAULT 'PRODUCT',
    "name" TEXT NOT NULL,
    "code" TEXT,
    "categoryId" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "imageKey" TEXT,
    "imageUrl" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "salePrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2),
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "durationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVariant" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "attributes" JSONB,
    "salePrice" DECIMAL(14,2),
    "costPrice" DECIMAL(14,2),
    "minStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_name_key" ON "ItemCategory"("name");

-- CreateIndex
CREATE INDEX "ItemCategory_isActive_sortOrder_idx" ON "ItemCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- CreateIndex
CREATE INDEX "Item_kind_isActive_idx" ON "Item"("kind", "isActive");

-- CreateIndex
CREATE INDEX "Item_categoryId_idx" ON "Item"("categoryId");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_sku_key" ON "ItemVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_barcode_key" ON "ItemVariant"("barcode");

-- CreateIndex
CREATE INDEX "ItemVariant_itemId_isActive_idx" ON "ItemVariant"("itemId", "isActive");

-- CreateIndex
CREATE INDEX "ItemVariant_barcode_idx" ON "ItemVariant"("barcode");

-- CreateIndex
CREATE INDEX "StockLevel_branchId_idx" ON "StockLevel"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_variantId_branchId_key" ON "StockLevel"("variantId", "branchId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_branchId_createdAt_idx" ON "StockMovement"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVariant" ADD CONSTRAINT "ItemVariant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

