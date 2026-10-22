-- AlterEnum
ALTER TYPE "EmailTemplateKey" ADD VALUE 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetRequestedAt" TIMESTAMP(3);
