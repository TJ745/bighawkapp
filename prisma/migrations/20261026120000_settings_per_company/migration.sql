-- Settings rows become per-company.
--
-- Each of the four single-row settings tables used the literal "default" as its primary key,
-- which is precisely the value a second company could never also have. The row is now found by
-- the company that owns it, and `UNIQUE (companyId)` is what keeps "single row" a promise the
-- database makes rather than a convention the code remembers.
--
-- The `DEFAULT ''` on every companyId is deliberate and is not a fallback: it exists so Prisma's
-- generated create types do not demand a column the tenant filter fills in. A write that slips
-- past the filter therefore reaches the foreign key with an id no company has, and is refused.

-- DropIndex
DROP INDEX "AppSettings_companyId_idx";

-- DropIndex
DROP INDEX "CompanySettings_companyId_idx";

-- DropIndex
DROP INDEX "EmailSettings_companyId_idx";

-- DropIndex
DROP INDEX "ZatcaSettings_companyId_idx";

-- AlterTable
ALTER TABLE "AppSettings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "AppointmentItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CompanySettings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CreditNote" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CreditNoteItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CustomerAdvance" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CustomerAdvanceRefund" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CustomerDocument" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "DocumentSequence" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "EmailSettings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "EmailTemplate" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "FinanceCategory" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "InvoiceAttachment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "InvoiceItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "InvoicePayment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ItemCategory" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ItemModifierGroup" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ItemVariant" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Membership" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "MembershipPlan" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "MembershipPlanService" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "MembershipUse" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ModifierGroup" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ModifierOption" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ModuleSetting" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "NotificationEvent" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "NotificationSetting" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "OtherIncome" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PaymentAccount" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosCashMovement" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosConfiguration" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosKitchenTicket" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosKitchenTicketItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosOrderCounter" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosPayment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosRegister" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosReturn" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosReturnItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosSale" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosSaleItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosSaleItemIngredient" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosSaleItemModifier" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosSaleItemStaff" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosShift" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PosTable" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PriceList" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PriceListItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PriceTier" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ProjectDocument" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PurchaseAttachment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PurchaseItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PurchasePayment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PurchaseReceipt" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "PurchaseReceiptItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Quotation" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "QuotationAttachment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "QuotationItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "RecipeComponent" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Rental" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "RolePermission" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "StaffMember" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Stay" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "StockLevel" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "SupplierDocument" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "SupplierQuotation" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "SupplierQuotationAttachment" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "SupplierQuotationItem" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "TicketEvent" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "TicketIssued" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "companyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ZatcaSettings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "companyId" SET DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_companyId_key" ON "AppSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSettings_companyId_key" ON "EmailSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ZatcaSettings_companyId_key" ON "ZatcaSettings"("companyId");

