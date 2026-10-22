-- CreateEnum
CREATE TYPE "PosKitchenStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PosKitchenTicket" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" "PosKitchenStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosKitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosKitchenTicketItem" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "options" TEXT,
    "signature" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PosKitchenTicketItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosKitchenTicket_branchId_status_sentAt_idx" ON "PosKitchenTicket"("branchId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "PosKitchenTicket_saleId_idx" ON "PosKitchenTicket"("saleId");

-- CreateIndex
CREATE INDEX "PosKitchenTicketItem_ticketId_idx" ON "PosKitchenTicketItem"("ticketId");

-- AddForeignKey
ALTER TABLE "PosKitchenTicket" ADD CONSTRAINT "PosKitchenTicket_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosKitchenTicket" ADD CONSTRAINT "PosKitchenTicket_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosKitchenTicketItem" ADD CONSTRAINT "PosKitchenTicketItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PosKitchenTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosKitchenTicketItem" ADD CONSTRAINT "PosKitchenTicketItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

