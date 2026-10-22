-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "priceListId" TEXT;

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" DECIMAL(14,2),
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "priceListItemId" TEXT NOT NULL,
    "minQuantity" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_name_key" ON "PriceList"("name");

-- CreateIndex
CREATE INDEX "PriceList_isActive_idx" ON "PriceList"("isActive");

-- CreateIndex
CREATE INDEX "PriceListItem_variantId_idx" ON "PriceListItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_listId_variantId_key" ON "PriceListItem"("listId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_priceListItemId_minQuantity_key" ON "PriceTier"("priceListItemId", "minQuantity");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

