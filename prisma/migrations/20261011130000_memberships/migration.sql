-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "variantId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlanService" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "MembershipPlanService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT,
    "planName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "sessionsIncluded" INTEGER NOT NULL DEFAULT 0,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipUse" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 1,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MembershipUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_name_key" ON "MembershipPlan"("name");

-- CreateIndex
CREATE INDEX "MembershipPlan_isActive_idx" ON "MembershipPlan"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlanService_planId_variantId_key" ON "MembershipPlanService"("planId", "variantId");

-- CreateIndex
CREATE INDEX "Membership_customerId_status_idx" ON "Membership"("customerId", "status");

-- CreateIndex
CREATE INDEX "Membership_branchId_endDate_idx" ON "Membership"("branchId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipUse_saleItemId_key" ON "MembershipUse"("saleItemId");

-- CreateIndex
CREATE INDEX "MembershipUse_membershipId_idx" ON "MembershipUse"("membershipId");

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlanService" ADD CONSTRAINT "MembershipPlanService_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlanService" ADD CONSTRAINT "MembershipPlanService_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipUse" ADD CONSTRAINT "MembershipUse_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipUse" ADD CONSTRAINT "MembershipUse_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

