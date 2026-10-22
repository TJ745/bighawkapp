-- CreateEnum
CREATE TYPE "ScaleBarcodeMode" AS ENUM ('WEIGHT', 'PRICE');

-- AlterTable
ALTER TABLE "ItemVariant" ADD COLUMN     "plu" TEXT;

-- AlterTable
ALTER TABLE "PosConfiguration" ADD COLUMN     "scaleBarcodeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scaleBarcodeMode" "ScaleBarcodeMode" NOT NULL DEFAULT 'WEIGHT',
ADD COLUMN     "scaleBarcodePrefix" TEXT NOT NULL DEFAULT '2',
ADD COLUMN     "scaleCodeDigits" INTEGER NOT NULL DEFAULT 5;

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_plu_key" ON "ItemVariant"("plu");

