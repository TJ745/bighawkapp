-- AlterTable
ALTER TABLE "MembershipUse" DROP COLUMN "returned",
ADD COLUMN     "returnedSessions" INTEGER NOT NULL DEFAULT 0;

