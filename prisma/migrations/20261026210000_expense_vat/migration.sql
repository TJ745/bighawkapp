-- VAT on a general expense.
--
-- Input VAT could only ever come from purchases, so a rent or courier invoice with VAT on it
-- contributed nothing to the VAT return and the reclaim was understated every quarter.
--
-- `amount` keeps its meaning exactly — what was paid, VAT included, which is what money-out
-- counts. The new columns say how much of it was tax. Existing rows default to zero, which is
-- the truth about them: no VAT was recorded, so none can be reclaimed.

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

