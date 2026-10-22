-- CreateTable
CREATE TABLE "RecipeComponent" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "ingredientVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleItemIngredient" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosSaleItemIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeComponent_variantId_idx" ON "RecipeComponent"("variantId");

-- CreateIndex
CREATE INDEX "RecipeComponent_ingredientVariantId_idx" ON "RecipeComponent"("ingredientVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeComponent_variantId_ingredientVariantId_key" ON "RecipeComponent"("variantId", "ingredientVariantId");

-- CreateIndex
CREATE INDEX "PosSaleItemIngredient_saleItemId_idx" ON "PosSaleItemIngredient"("saleItemId");

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_ingredientVariantId_fkey" FOREIGN KEY ("ingredientVariantId") REFERENCES "ItemVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemIngredient" ADD CONSTRAINT "PosSaleItemIngredient_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemIngredient" ADD CONSTRAINT "PosSaleItemIngredient_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

