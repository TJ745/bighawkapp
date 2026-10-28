-- How many users and branches each customer has bought.
--
-- Both counts include the first of their kind: the administrator counts towards the user limit
-- and MAIN counts towards the branch limit, because "five users" is easier to sell and to explain
-- than "five plus one". Existing companies get the same default a new one does; the operator
-- raises it per customer from Settings → Companies.
ALTER TABLE "Company" ADD COLUMN "userLimit" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Company" ADD COLUMN "branchLimit" INTEGER NOT NULL DEFAULT 5;
