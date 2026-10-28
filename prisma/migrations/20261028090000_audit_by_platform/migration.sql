-- Which audit entries were made by BigHawk's own operator rather than by the customer's staff.
--
-- The row keeps the company it affected, because that is the only log where it means anything.
-- What changes is who is shown it: the customer's people see their own colleagues' work, the
-- operator sees everything, across every customer.
--
-- Existing rows default to false. A handful of them were in fact the operator's, but guessing
-- which from the user id afterwards would be a worse record than leaving history as it was found.
ALTER TABLE "AuditLog" ADD COLUMN "byPlatform" BOOLEAN NOT NULL DEFAULT false;

-- The company screen reads "this company, not platform rows, newest first" on every page load.
CREATE INDEX "AuditLog_companyId_byPlatform_createdAt_idx" ON "AuditLog"("companyId", "byPlatform", "createdAt");
