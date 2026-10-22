-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemModifierGroup" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleItemModifier" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "optionId" TEXT,
    "groupName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "priceDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosSaleItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModifierGroup_name_key" ON "ModifierGroup"("name");

-- CreateIndex
CREATE INDEX "ModifierGroup_isActive_sortOrder_idx" ON "ModifierGroup"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ModifierOption_groupId_isActive_idx" ON "ModifierOption"("groupId", "isActive");

-- CreateIndex
CREATE INDEX "ItemModifierGroup_itemId_idx" ON "ItemModifierGroup"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemModifierGroup_itemId_groupId_key" ON "ItemModifierGroup"("itemId", "groupId");

-- CreateIndex
CREATE INDEX "PosSaleItemModifier_saleItemId_idx" ON "PosSaleItemModifier"("saleItemId");

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModifierGroup" ADD CONSTRAINT "ItemModifierGroup_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModifierGroup" ADD CONSTRAINT "ItemModifierGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemModifier" ADD CONSTRAINT "PosSaleItemModifier_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

