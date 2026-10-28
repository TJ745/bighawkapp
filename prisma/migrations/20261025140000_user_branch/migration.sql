-- AlterTable
ALTER TABLE "User" ADD COLUMN     "branchId" TEXT;
-- CreateIndex
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
