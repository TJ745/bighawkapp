-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTATION', 'INVOICE', 'PURCHASE', 'EXPENSE', 'PAYMENT', 'PROJECT', 'SUPPLIER_QUOTATION', 'INCOME');

-- CreateEnum
CREATE TYPE "PaymentAccountType" AS ENUM ('COMPANY_BANK', 'CASH', 'OTHER_BANK');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVOICE_OVERDUE', 'INVOICE_DUE_SOON', 'SUPPLIER_PAYMENT_DUE', 'CUSTOMER_PAYMENT_RECEIVED', 'QUOTATION_ACCEPTED', 'NEW_USER_CREATED');

-- CreateEnum
CREATE TYPE "EmailTemplateKey" AS ENUM ('QUOTATION', 'INVOICE', 'PAYMENT_REMINDER', 'SUPPLIER_PAYMENT_REMINDER', 'NEW_USER');

-- CreateEnum
CREATE TYPE "PdfHeaderStyle" AS ENUM ('STANDARD', 'CENTERED', 'MINIMAL');

-- CreateEnum
CREATE TYPE "PdfFont" AS ENUM ('HELVETICA', 'TIMES', 'COURIER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "crNumber" TEXT,
    "vatNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "nationalAddress" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "iban" TEXT,
    "accountNumber" TEXT,
    "description" TEXT,
    "additionalContact" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "vatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultVatRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "allowVatChange" BOOLEAN NOT NULL DEFAULT true,
    "defaultPaymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "defaultDepositPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "defaultRemainingDueDays" INTEGER NOT NULL DEFAULT 30,
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "numberFormat" TEXT NOT NULL DEFAULT '1,234.56',
    "primaryColor" TEXT NOT NULL DEFAULT '#1d4ed8',
    "secondaryColor" TEXT NOT NULL DEFAULT '#64748b',
    "pdfFont" "PdfFont" NOT NULL DEFAULT 'HELVETICA',
    "pdfHeaderStyle" "PdfHeaderStyle" NOT NULL DEFAULT 'STANDARD',
    "pdfFooterText" TEXT NOT NULL DEFAULT '',
    "emailSignature" TEXT NOT NULL DEFAULT '',
    "quotationTerms" TEXT NOT NULL DEFAULT '',
    "invoiceTerms" TEXT NOT NULL DEFAULT '',
    "invoiceDueSoonDays" INTEGER NOT NULL DEFAULT 3,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 720,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireNumber" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT false,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "prefix" TEXT NOT NULL,
    "startingNumber" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "includeYear" BOOLEAN NOT NULL DEFAULT true,
    "currentYear" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentAccountType" NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "recipientUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" "EmailTemplateKey" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_type_key" ON "DocumentSequence"("type");

-- CreateIndex
CREATE INDEX "PaymentAccount_isActive_idx" ON "PaymentAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_type_key" ON "NotificationSetting"("type");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

