-- CreateEnum
CREATE TYPE "AppModule" AS ENUM ('BUSINESS_MANAGEMENT', 'POS');

-- CreateEnum
CREATE TYPE "PosBusinessType" AS ENUM ('RETAIL', 'GROCERY', 'APPAREL', 'RESTAURANT', 'QSR', 'CAFE', 'BAKERY', 'BAR', 'FOOD_TRUCK', 'SALON', 'SPA', 'GYM', 'REPAIR', 'WHOLESALE', 'HOTEL', 'CINEMA', 'ENTERTAINMENT', 'OTHER');

-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'POS';

-- CreateTable
CREATE TABLE "ModuleSetting" (
    "id" TEXT NOT NULL,
    "module" "AppModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "address" TEXT,
    "vatNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosConfiguration" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "businessType" "PosBusinessType" NOT NULL DEFAULT 'RETAIL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "receiptHeader" TEXT NOT NULL DEFAULT '',
    "receiptFooter" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleSetting_module_key" ON "ModuleSetting"("module");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PosConfiguration_branchId_key" ON "PosConfiguration"("branchId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "PosConfiguration" ADD CONSTRAINT "PosConfiguration_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

