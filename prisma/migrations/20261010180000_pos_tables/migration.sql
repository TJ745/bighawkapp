-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "guestCount" INTEGER,
ADD COLUMN     "tableId" TEXT;

-- CreateTable
CREATE TABLE "PosTable" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosTable_branchId_isActive_idx" ON "PosTable"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PosTable_branchId_name_key" ON "PosTable"("branchId", "name");

-- CreateIndex
CREATE INDEX "PosSale_tableId_status_idx" ON "PosSale"("tableId", "status");

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PosTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTable" ADD CONSTRAINT "PosTable_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

