-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "clientReference" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "PosSale_clientReference_key" ON "PosSale"("clientReference");
