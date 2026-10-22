-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('RECEIVED', 'DIAGNOSING', 'QUOTED', 'APPROVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StayStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('OUT', 'RETURNED', 'OVERDUE', 'LOST');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'WORK_ORDER';
ALTER TYPE "DocumentType" ADD VALUE 'STAY';

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "itemName" TEXT NOT NULL,
    "serialNumber" TEXT,
    "faultReported" TEXT NOT NULL,
    "diagnosis" TEXT,
    "estimate" DECIMAL(14,2),
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "staffId" TEXT,
    "promisedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "saleId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketIssued" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "places" INTEGER NOT NULL,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketIssued_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "nightlyRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "variantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "customerId" TEXT,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "nightlyRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "status" "StayStatus" NOT NULL DEFAULT 'BOOKED',
    "note" TEXT,
    "folioId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "variantId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "dailyRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "status" "RentalStatus" NOT NULL DEFAULT 'OUT',
    "lateFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "saleId" TEXT,
    "settledSaleId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_saleId_key" ON "WorkOrder"("saleId");

-- CreateIndex
CREATE INDEX "WorkOrder_branchId_status_idx" ON "WorkOrder"("branchId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");

-- CreateIndex
CREATE INDEX "TicketEvent_branchId_startsAt_idx" ON "TicketEvent"("branchId", "startsAt");

-- CreateIndex
CREATE INDEX "TicketEvent_isActive_idx" ON "TicketEvent"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TicketIssued_saleItemId_key" ON "TicketIssued"("saleItemId");

-- CreateIndex
CREATE INDEX "TicketIssued_eventId_idx" ON "TicketIssued"("eventId");

-- CreateIndex
CREATE INDEX "Room_branchId_isActive_idx" ON "Room"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Room_branchId_name_key" ON "Room"("branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Stay_number_key" ON "Stay"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Stay_folioId_key" ON "Stay"("folioId");

-- CreateIndex
CREATE INDEX "Stay_branchId_checkIn_idx" ON "Stay"("branchId", "checkIn");

-- CreateIndex
CREATE INDEX "Stay_roomId_checkIn_idx" ON "Stay"("roomId", "checkIn");

-- CreateIndex
CREATE INDEX "Stay_status_idx" ON "Stay"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_number_key" ON "Rental"("number");

-- CreateIndex
CREATE INDEX "Rental_branchId_status_idx" ON "Rental"("branchId", "status");

-- CreateIndex
CREATE INDEX "Rental_dueAt_idx" ON "Rental"("dueAt");

-- CreateIndex
CREATE INDEX "Rental_customerId_idx" ON "Rental"("customerId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketIssued" ADD CONSTRAINT "TicketIssued_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketIssued" ADD CONSTRAINT "TicketIssued_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_settledSaleId_fkey" FOREIGN KEY ("settledSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

