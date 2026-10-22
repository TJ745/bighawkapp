import type { Metadata } from "next";
import { TablesManager } from "@/components/pos/tables-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listTables } from "@/lib/data/tables";

export const metadata: Metadata = { title: "Table setup" };

/** The floor plan itself: manager territory, like registers. */
export default async function TableSetupPage() {
  const auth = await requirePosCapability("TABLES", "INVENTORY", "view");
  const branch = await getCurrentBranch();
  const tables = await listTables(branch.id);

  return (
    <>
      <PageHeader title="Table setup" description={`The tables at ${branch.name}, and the sections they sit in.`} />
      <TablesManager
        tables={tables.map((table) => ({
          id: table.id,
          name: table.name,
          area: table.area,
          seats: table.seats,
          sortOrder: table.sortOrder,
          isActive: table.isActive,
          openOrders: table.orders.length,
        }))}
        branchName={branch.name}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
