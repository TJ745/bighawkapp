-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "userId" TEXT,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "colour" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleItemStaff" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "staffId" TEXT,
    "staffName" TEXT NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reversedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PosSaleItemStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "staffId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "note" TEXT,
    "saleId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentItem" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "staffId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AppointmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_userId_key" ON "StaffMember"("userId");

-- CreateIndex
CREATE INDEX "StaffMember_branchId_isActive_idx" ON "StaffMember"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_branchId_name_key" ON "StaffMember"("branchId", "name");

-- CreateIndex
CREATE INDEX "PosSaleItemStaff_saleItemId_idx" ON "PosSaleItemStaff"("saleItemId");

-- CreateIndex
CREATE INDEX "PosSaleItemStaff_staffId_idx" ON "PosSaleItemStaff"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_saleId_key" ON "Appointment"("saleId");

-- CreateIndex
CREATE INDEX "Appointment_branchId_startAt_idx" ON "Appointment"("branchId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_staffId_startAt_idx" ON "Appointment"("staffId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_customerId_idx" ON "Appointment"("customerId");

-- CreateIndex
CREATE INDEX "AppointmentItem_appointmentId_idx" ON "AppointmentItem"("appointmentId");

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemStaff" ADD CONSTRAINT "PosSaleItemStaff_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "PosSaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemStaff" ADD CONSTRAINT "PosSaleItemStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

