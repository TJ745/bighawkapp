-- CreateEnum
CREATE TYPE "ZatcaMode" AS ENUM ('OFF', 'PHASE_1');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "additionalNumber" TEXT,
ADD COLUMN     "addressAr" TEXT,
ADD COLUMN     "buildingNumber" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyNameAr" TEXT,
ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'SA',
ADD COLUMN     "district" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "streetName" TEXT;

-- CreateTable
CREATE TABLE "ZatcaSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mode" "ZatcaMode" NOT NULL DEFAULT 'OFF',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZatcaSettings_pkey" PRIMARY KEY ("id")
);
