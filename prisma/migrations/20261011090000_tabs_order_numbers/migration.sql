-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "orderNumber" INTEGER,
ADD COLUMN     "tabName" TEXT;

-- CreateTable
CREATE TABLE "PosOrderCounter" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosOrderCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosOrderCounter_branchId_date_key" ON "PosOrderCounter"("branchId", "date");

-- CreateIndex
CREATE INDEX "PosSale_branchId_date_orderNumber_idx" ON "PosSale"("branchId", "date", "orderNumber");

-- AddForeignKey
ALTER TABLE "PosOrderCounter" ADD CONSTRAINT "PosOrderCounter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

