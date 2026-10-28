-- Finance category names are unique per company, not across the platform.
--
-- Every other business identifier was made per-company when multi-tenancy landed; this one was
-- missed. The effect was not a data leak but a stranger one: the first customer to create an
-- expense category called "Rent" took the name from every other customer, who were then told
-- "a category with this name already exists" about a row they had no way of seeing.
DROP INDEX "FinanceCategory_kind_name_key";

CREATE UNIQUE INDEX "FinanceCategory_companyId_kind_name_key" ON "FinanceCategory"("companyId", "kind", "name");
