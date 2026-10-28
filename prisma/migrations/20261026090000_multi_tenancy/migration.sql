-- Multi-tenancy: every tenant-owned row gains the company it belongs to.
--
-- The column cannot simply be added NOT NULL, because these tables already hold one company's
-- data. So: create the company, add the column nullable, point every existing row at it, and only
-- then make it required. Existing data becomes the first tenant and nothing is lost.
--
-- The 32 dropped unique indexes are business identifiers — document numbers, role names, SKUs —
-- which were unique across the whole database and must now be unique *per company*, so that two
-- customers can each have their own INV-2026-0001. They are recreated as composites below.

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- The company that owns everything recorded so far.
INSERT INTO "Company" ("id", "name", "slug", "isActive", "createdAt", "updatedAt")
SELECT
    'cmp_bighawk_first_company',
    COALESCE(NULLIF(TRIM((SELECT "companyName" FROM "CompanySettings" LIMIT 1)), ''), 'My Company'),
    'first-company',
    true,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Company");

-- Step 1: the column, nullable for now.
ALTER TABLE "AppSettings" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AppointmentItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Branch" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CreditNote" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CreditNoteItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CustomerAdvance" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CustomerAdvanceRefund" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CustomerDocument" ADD COLUMN "companyId" TEXT;
ALTER TABLE "DocumentSequence" ADD COLUMN "companyId" TEXT;
ALTER TABLE "EmailSettings" ADD COLUMN "companyId" TEXT;
ALTER TABLE "EmailTemplate" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "companyId" TEXT;
ALTER TABLE "FinanceCategory" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "companyId" TEXT;
ALTER TABLE "InvoiceAttachment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "InvoicePayment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Item" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ItemCategory" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ItemModifierGroup" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ItemVariant" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Membership" ADD COLUMN "companyId" TEXT;
ALTER TABLE "MembershipPlan" ADD COLUMN "companyId" TEXT;
ALTER TABLE "MembershipPlanService" ADD COLUMN "companyId" TEXT;
ALTER TABLE "MembershipUse" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ModifierGroup" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ModifierOption" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ModuleSetting" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "companyId" TEXT;
ALTER TABLE "NotificationEvent" ADD COLUMN "companyId" TEXT;
ALTER TABLE "NotificationSetting" ADD COLUMN "companyId" TEXT;
ALTER TABLE "OtherIncome" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PaymentAccount" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosCashMovement" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosConfiguration" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosKitchenTicket" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosKitchenTicketItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosOrderCounter" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosPayment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosRegister" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosReturn" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosReturnItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosSale" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosSaleItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosSaleItemIngredient" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosSaleItemModifier" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosSaleItemStaff" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosShift" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PosTable" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PriceList" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PriceListItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PriceTier" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Project" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ProjectDocument" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PurchaseAttachment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PurchasePayment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PurchaseReceipt" ADD COLUMN "companyId" TEXT;
ALTER TABLE "PurchaseReceiptItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "companyId" TEXT;
ALTER TABLE "QuotationAttachment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "QuotationItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "RecipeComponent" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Rental" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Role" ADD COLUMN "companyId" TEXT;
ALTER TABLE "RolePermission" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Room" ADD COLUMN "companyId" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Stay" ADD COLUMN "companyId" TEXT;
ALTER TABLE "StockLevel" ADD COLUMN "companyId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SupplierDocument" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SupplierQuotation" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SupplierQuotationAttachment" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SupplierQuotationItem" ADD COLUMN "companyId" TEXT;
ALTER TABLE "TicketEvent" ADD COLUMN "companyId" TEXT;
ALTER TABLE "TicketIssued" ADD COLUMN "companyId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ZatcaSettings" ADD COLUMN "companyId" TEXT;

-- The operator has no company, so this one stays nullable and is not backfilled.
ALTER TABLE "User" ADD COLUMN "companyId" TEXT;

-- Step 2: everything recorded so far belongs to that company.
UPDATE "AppSettings" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Appointment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "AppointmentItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "AuditLog" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Branch" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "CompanySettings" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "CreditNote" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "CreditNoteItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Customer" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "CustomerAdvance" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "CustomerAdvanceRefund" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "CustomerDocument" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "DocumentSequence" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "EmailSettings" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "EmailTemplate" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Expense" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "FinanceCategory" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Invoice" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "InvoiceAttachment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "InvoiceItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "InvoicePayment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Item" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ItemCategory" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ItemModifierGroup" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ItemVariant" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Membership" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "MembershipPlan" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "MembershipPlanService" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "MembershipUse" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ModifierGroup" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ModifierOption" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ModuleSetting" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Notification" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "NotificationEvent" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "NotificationSetting" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "OtherIncome" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PaymentAccount" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosCashMovement" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosConfiguration" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosKitchenTicket" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosKitchenTicketItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosOrderCounter" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosPayment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosRegister" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosReturn" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosReturnItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosSale" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosSaleItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosSaleItemIngredient" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosSaleItemModifier" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosSaleItemStaff" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosShift" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PosTable" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PriceList" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PriceListItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PriceTier" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Project" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ProjectDocument" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Purchase" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PurchaseAttachment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PurchaseItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PurchasePayment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PurchaseReceipt" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "PurchaseReceiptItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Quotation" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "QuotationAttachment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "QuotationItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "RecipeComponent" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Rental" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Role" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "RolePermission" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Room" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "StaffMember" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Stay" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "StockLevel" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "StockMovement" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "Supplier" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "SupplierDocument" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "SupplierQuotation" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "SupplierQuotationAttachment" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "SupplierQuotationItem" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "TicketEvent" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "TicketIssued" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "WorkOrder" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;
UPDATE "ZatcaSettings" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL;

-- Every existing user works for it too; the operator is detached afterwards by the seed.
UPDATE "User" SET "companyId" = 'cmp_bighawk_first_company' WHERE "companyId" IS NULL AND "isSuperAdmin" = false;

-- Step 3: now it can be required.
ALTER TABLE "AppSettings" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AppointmentItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Branch" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CompanySettings" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CreditNote" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CreditNoteItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CustomerAdvance" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CustomerAdvanceRefund" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "CustomerDocument" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DocumentSequence" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "EmailSettings" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "EmailTemplate" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "FinanceCategory" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "InvoiceAttachment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "InvoiceItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "InvoicePayment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ItemCategory" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ItemModifierGroup" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ItemVariant" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Membership" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "MembershipPlan" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "MembershipPlanService" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "MembershipUse" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ModifierGroup" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ModifierOption" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ModuleSetting" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "NotificationEvent" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "NotificationSetting" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "OtherIncome" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PaymentAccount" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosCashMovement" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosConfiguration" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosKitchenTicket" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosKitchenTicketItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosOrderCounter" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosPayment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosRegister" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosReturn" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosReturnItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosSale" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosSaleItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosSaleItemIngredient" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosSaleItemModifier" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosSaleItemStaff" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosShift" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PosTable" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PriceList" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PriceListItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PriceTier" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ProjectDocument" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PurchaseAttachment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PurchaseItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PurchasePayment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PurchaseReceipt" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "PurchaseReceiptItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Quotation" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "QuotationAttachment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "QuotationItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "RecipeComponent" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Rental" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Role" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "RolePermission" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Room" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "StaffMember" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Stay" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "StockLevel" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Supplier" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SupplierDocument" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SupplierQuotation" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SupplierQuotationAttachment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "SupplierQuotationItem" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "TicketEvent" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "TicketIssued" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "WorkOrder" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ZatcaSettings" ALTER COLUMN "companyId" SET NOT NULL;

-- DropIndex
DROP INDEX "Branch_code_key";

-- DropIndex
DROP INDEX "CreditNote_number_key";

-- DropIndex
DROP INDEX "CustomerAdvance_number_key";

-- DropIndex
DROP INDEX "DocumentSequence_type_key";

-- DropIndex
DROP INDEX "EmailTemplate_key_key";

-- DropIndex
DROP INDEX "Expense_number_key";

-- DropIndex
DROP INDEX "Invoice_number_key";

-- DropIndex
DROP INDEX "InvoicePayment_number_key";

-- DropIndex
DROP INDEX "Item_code_key";

-- DropIndex
DROP INDEX "ItemCategory_name_key";

-- DropIndex
DROP INDEX "ItemVariant_barcode_key";

-- DropIndex
DROP INDEX "ItemVariant_plu_key";

-- DropIndex
DROP INDEX "ItemVariant_sku_key";

-- DropIndex
DROP INDEX "MembershipPlan_name_key";

-- DropIndex
DROP INDEX "ModifierGroup_name_key";

-- DropIndex
DROP INDEX "ModuleSetting_module_key";

-- DropIndex
DROP INDEX "NotificationEvent_key_key";

-- DropIndex
DROP INDEX "NotificationSetting_type_key";

-- DropIndex
DROP INDEX "OtherIncome_number_key";

-- DropIndex
DROP INDEX "PosReturn_number_key";

-- DropIndex
DROP INDEX "PosSale_number_key";

-- DropIndex
DROP INDEX "PriceList_name_key";

-- DropIndex
DROP INDEX "Project_code_key";

-- DropIndex
DROP INDEX "Purchase_number_key";

-- DropIndex
DROP INDEX "PurchasePayment_number_key";

-- DropIndex
DROP INDEX "PurchaseReceipt_number_key";

-- DropIndex
DROP INDEX "Quotation_number_key";

-- DropIndex
DROP INDEX "Rental_number_key";

-- DropIndex
DROP INDEX "Role_name_key";

-- DropIndex
DROP INDEX "Stay_number_key";

-- DropIndex
DROP INDEX "SupplierQuotation_number_key";

-- DropIndex
DROP INDEX "WorkOrder_number_key";

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- AlterTable

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_isActive_idx" ON "Company"("isActive");

-- CreateIndex
CREATE INDEX "AppSettings_companyId_idx" ON "AppSettings"("companyId");

-- CreateIndex
CREATE INDEX "Appointment_companyId_idx" ON "Appointment"("companyId");

-- CreateIndex
CREATE INDEX "AppointmentItem_companyId_idx" ON "AppointmentItem"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "Branch_companyId_idx" ON "Branch"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompanySettings_companyId_idx" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE INDEX "CreditNote_companyId_idx" ON "CreditNote"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_companyId_number_key" ON "CreditNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "CreditNoteItem_companyId_idx" ON "CreditNoteItem"("companyId");

-- CreateIndex
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");

-- CreateIndex
CREATE INDEX "CustomerAdvance_companyId_idx" ON "CustomerAdvance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAdvance_companyId_number_key" ON "CustomerAdvance"("companyId", "number");

-- CreateIndex
CREATE INDEX "CustomerAdvanceRefund_companyId_idx" ON "CustomerAdvanceRefund"("companyId");

-- CreateIndex
CREATE INDEX "CustomerDocument_companyId_idx" ON "CustomerDocument"("companyId");

-- CreateIndex
CREATE INDEX "DocumentSequence_companyId_idx" ON "DocumentSequence"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_companyId_type_key" ON "DocumentSequence"("companyId", "type");

-- CreateIndex
CREATE INDEX "EmailSettings_companyId_idx" ON "EmailSettings"("companyId");

-- CreateIndex
CREATE INDEX "EmailTemplate_companyId_idx" ON "EmailTemplate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_companyId_key_key" ON "EmailTemplate"("companyId", "key");

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "Expense"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_companyId_number_key" ON "Expense"("companyId", "number");

-- CreateIndex
CREATE INDEX "FinanceCategory_companyId_idx" ON "FinanceCategory"("companyId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_number_key" ON "Invoice"("companyId", "number");

-- CreateIndex
CREATE INDEX "InvoiceAttachment_companyId_idx" ON "InvoiceAttachment"("companyId");

-- CreateIndex
CREATE INDEX "InvoiceItem_companyId_idx" ON "InvoiceItem"("companyId");

-- CreateIndex
CREATE INDEX "InvoicePayment_companyId_idx" ON "InvoicePayment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_companyId_number_key" ON "InvoicePayment"("companyId", "number");

-- CreateIndex
CREATE INDEX "Item_companyId_idx" ON "Item"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_companyId_code_key" ON "Item"("companyId", "code");

-- CreateIndex
CREATE INDEX "ItemCategory_companyId_idx" ON "ItemCategory"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_companyId_name_key" ON "ItemCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "ItemModifierGroup_companyId_idx" ON "ItemModifierGroup"("companyId");

-- CreateIndex
CREATE INDEX "ItemVariant_companyId_idx" ON "ItemVariant"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_companyId_sku_key" ON "ItemVariant"("companyId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_companyId_barcode_key" ON "ItemVariant"("companyId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_companyId_plu_key" ON "ItemVariant"("companyId", "plu");

-- CreateIndex
CREATE INDEX "Membership_companyId_idx" ON "Membership"("companyId");

-- CreateIndex
CREATE INDEX "MembershipPlan_companyId_idx" ON "MembershipPlan"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_companyId_name_key" ON "MembershipPlan"("companyId", "name");

-- CreateIndex
CREATE INDEX "MembershipPlanService_companyId_idx" ON "MembershipPlanService"("companyId");

-- CreateIndex
CREATE INDEX "MembershipUse_companyId_idx" ON "MembershipUse"("companyId");

-- CreateIndex
CREATE INDEX "ModifierGroup_companyId_idx" ON "ModifierGroup"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ModifierGroup_companyId_name_key" ON "ModifierGroup"("companyId", "name");

-- CreateIndex
CREATE INDEX "ModifierOption_companyId_idx" ON "ModifierOption"("companyId");

-- CreateIndex
CREATE INDEX "ModuleSetting_companyId_idx" ON "ModuleSetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleSetting_companyId_module_key" ON "ModuleSetting"("companyId", "module");

-- CreateIndex
CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");

-- CreateIndex
CREATE INDEX "NotificationEvent_companyId_idx" ON "NotificationEvent"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_companyId_key_key" ON "NotificationEvent"("companyId", "key");

-- CreateIndex
CREATE INDEX "NotificationSetting_companyId_idx" ON "NotificationSetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_companyId_type_key" ON "NotificationSetting"("companyId", "type");

-- CreateIndex
CREATE INDEX "OtherIncome_companyId_idx" ON "OtherIncome"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OtherIncome_companyId_number_key" ON "OtherIncome"("companyId", "number");

-- CreateIndex
CREATE INDEX "PaymentAccount_companyId_idx" ON "PaymentAccount"("companyId");

-- CreateIndex
CREATE INDEX "PosCashMovement_companyId_idx" ON "PosCashMovement"("companyId");

-- CreateIndex
CREATE INDEX "PosConfiguration_companyId_idx" ON "PosConfiguration"("companyId");

-- CreateIndex
CREATE INDEX "PosKitchenTicket_companyId_idx" ON "PosKitchenTicket"("companyId");

-- CreateIndex
CREATE INDEX "PosKitchenTicketItem_companyId_idx" ON "PosKitchenTicketItem"("companyId");

-- CreateIndex
CREATE INDEX "PosOrderCounter_companyId_idx" ON "PosOrderCounter"("companyId");

-- CreateIndex
CREATE INDEX "PosPayment_companyId_idx" ON "PosPayment"("companyId");

-- CreateIndex
CREATE INDEX "PosRegister_companyId_idx" ON "PosRegister"("companyId");

-- CreateIndex
CREATE INDEX "PosReturn_companyId_idx" ON "PosReturn"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PosReturn_companyId_number_key" ON "PosReturn"("companyId", "number");

-- CreateIndex
CREATE INDEX "PosReturnItem_companyId_idx" ON "PosReturnItem"("companyId");

-- CreateIndex
CREATE INDEX "PosSale_companyId_idx" ON "PosSale"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_companyId_number_key" ON "PosSale"("companyId", "number");

-- CreateIndex
CREATE INDEX "PosSaleItem_companyId_idx" ON "PosSaleItem"("companyId");

-- CreateIndex
CREATE INDEX "PosSaleItemIngredient_companyId_idx" ON "PosSaleItemIngredient"("companyId");

-- CreateIndex
CREATE INDEX "PosSaleItemModifier_companyId_idx" ON "PosSaleItemModifier"("companyId");

-- CreateIndex
CREATE INDEX "PosSaleItemStaff_companyId_idx" ON "PosSaleItemStaff"("companyId");

-- CreateIndex
CREATE INDEX "PosShift_companyId_idx" ON "PosShift"("companyId");

-- CreateIndex
CREATE INDEX "PosTable_companyId_idx" ON "PosTable"("companyId");

-- CreateIndex
CREATE INDEX "PriceList_companyId_idx" ON "PriceList"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_companyId_name_key" ON "PriceList"("companyId", "name");

-- CreateIndex
CREATE INDEX "PriceListItem_companyId_idx" ON "PriceListItem"("companyId");

-- CreateIndex
CREATE INDEX "PriceTier_companyId_idx" ON "PriceTier"("companyId");

-- CreateIndex
CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_code_key" ON "Project"("companyId", "code");

-- CreateIndex
CREATE INDEX "ProjectDocument_companyId_idx" ON "ProjectDocument"("companyId");

-- CreateIndex
CREATE INDEX "Purchase_companyId_idx" ON "Purchase"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_companyId_number_key" ON "Purchase"("companyId", "number");

-- CreateIndex
CREATE INDEX "PurchaseAttachment_companyId_idx" ON "PurchaseAttachment"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseItem_companyId_idx" ON "PurchaseItem"("companyId");

-- CreateIndex
CREATE INDEX "PurchasePayment_companyId_idx" ON "PurchasePayment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchasePayment_companyId_number_key" ON "PurchasePayment"("companyId", "number");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_companyId_idx" ON "PurchaseReceipt"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_companyId_number_key" ON "PurchaseReceipt"("companyId", "number");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_companyId_idx" ON "PurchaseReceiptItem"("companyId");

-- CreateIndex
CREATE INDEX "Quotation_companyId_idx" ON "Quotation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_companyId_number_key" ON "Quotation"("companyId", "number");

-- CreateIndex
CREATE INDEX "QuotationAttachment_companyId_idx" ON "QuotationAttachment"("companyId");

-- CreateIndex
CREATE INDEX "QuotationItem_companyId_idx" ON "QuotationItem"("companyId");

-- CreateIndex
CREATE INDEX "RecipeComponent_companyId_idx" ON "RecipeComponent"("companyId");

-- CreateIndex
CREATE INDEX "Rental_companyId_idx" ON "Rental"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_companyId_number_key" ON "Rental"("companyId", "number");

-- CreateIndex
CREATE INDEX "Role_companyId_idx" ON "Role"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_name_key" ON "Role"("companyId", "name");

-- CreateIndex
CREATE INDEX "RolePermission_companyId_idx" ON "RolePermission"("companyId");

-- CreateIndex
CREATE INDEX "Room_companyId_idx" ON "Room"("companyId");

-- CreateIndex
CREATE INDEX "StaffMember_companyId_idx" ON "StaffMember"("companyId");

-- CreateIndex
CREATE INDEX "Stay_companyId_idx" ON "Stay"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Stay_companyId_number_key" ON "Stay"("companyId", "number");

-- CreateIndex
CREATE INDEX "StockLevel_companyId_idx" ON "StockLevel"("companyId");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_idx" ON "StockMovement"("companyId");

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- CreateIndex
CREATE INDEX "SupplierDocument_companyId_idx" ON "SupplierDocument"("companyId");

-- CreateIndex
CREATE INDEX "SupplierQuotation_companyId_idx" ON "SupplierQuotation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierQuotation_companyId_number_key" ON "SupplierQuotation"("companyId", "number");

-- CreateIndex
CREATE INDEX "SupplierQuotationAttachment_companyId_idx" ON "SupplierQuotationAttachment"("companyId");

-- CreateIndex
CREATE INDEX "SupplierQuotationItem_companyId_idx" ON "SupplierQuotationItem"("companyId");

-- CreateIndex
CREATE INDEX "TicketEvent_companyId_idx" ON "TicketEvent"("companyId");

-- CreateIndex
CREATE INDEX "TicketIssued_companyId_idx" ON "TicketIssued"("companyId");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_idx" ON "WorkOrder"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_companyId_number_key" ON "WorkOrder"("companyId", "number");

-- CreateIndex
CREATE INDEX "ZatcaSettings_companyId_idx" ON "ZatcaSettings"("companyId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZatcaSettings" ADD CONSTRAINT "ZatcaSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSettings" ADD CONSTRAINT "EmailSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDocument" ADD CONSTRAINT "SupplierDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationAttachment" ADD CONSTRAINT "QuotationAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAttachment" ADD CONSTRAINT "InvoiceAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvanceRefund" ADD CONSTRAINT "CustomerAdvanceRefund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationItem" ADD CONSTRAINT "SupplierQuotationItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotationAttachment" ADD CONSTRAINT "SupplierQuotationAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAttachment" ADD CONSTRAINT "PurchaseAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCategory" ADD CONSTRAINT "FinanceCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleSetting" ADD CONSTRAINT "ModuleSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosConfiguration" ADD CONSTRAINT "PosConfiguration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVariant" ADD CONSTRAINT "ItemVariant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosRegister" ADD CONSTRAINT "PosRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosCashMovement" ADD CONSTRAINT "PosCashMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTable" ADD CONSTRAINT "PosTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItem" ADD CONSTRAINT "PosSaleItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosPayment" ADD CONSTRAINT "PosPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturn" ADD CONSTRAINT "PosReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosReturnItem" ADD CONSTRAINT "PosReturnItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierGroup" ADD CONSTRAINT "ModifierGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierOption" ADD CONSTRAINT "ModifierOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemModifierGroup" ADD CONSTRAINT "ItemModifierGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemModifier" ADD CONSTRAINT "PosSaleItemModifier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosKitchenTicket" ADD CONSTRAINT "PosKitchenTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosKitchenTicketItem" ADD CONSTRAINT "PosKitchenTicketItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeComponent" ADD CONSTRAINT "RecipeComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemIngredient" ADD CONSTRAINT "PosSaleItemIngredient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosOrderCounter" ADD CONSTRAINT "PosOrderCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleItemStaff" ADD CONSTRAINT "PosSaleItemStaff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlanService" ADD CONSTRAINT "MembershipPlanService_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipUse" ADD CONSTRAINT "MembershipUse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketIssued" ADD CONSTRAINT "TicketIssued_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
