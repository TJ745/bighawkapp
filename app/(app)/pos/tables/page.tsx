import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FloorPlan } from "@/components/pos/floor-plan";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listTables } from "@/lib/data/tables";
import { kitchenStateBySale } from "@/lib/data/kitchen";
import { posTypeHasCapability } from "@/lib/platform/pos-types";
import { formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Tables" };

/** The floor: free and occupied tables, with what each party owes so far. */
export default async function TablesPage() {
  const auth = await requirePosCapability("TABLES", "POS_ORDERS", "view");
  const branch = await getCurrentBranch();
  const tables = await listTables(branch.id);
  // The floor only shows kitchen progress where the branch actually has a kitchen.
  const cooksToOrder = posTypeHasCapability(branch.posConfig?.businessType ?? "RETAIL", "KITCHEN");
  const kitchen = cooksToOrder ? await kitchenStateBySale(tables.flatMap((t) => t.orders.map((o) => o.id))) : new Map();
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Tables"
        description={`Dine-in orders at ${branch.name}. Each open table is a bill that grows until the party pays.`}
        actions={
          auth.can("INVENTORY", "edit") ? (
            <Button asChild variant="outline">
              <Link href="/pos/tables/setup">Set up tables</Link>
            </Button>
          ) : null
        }
      />
      <FloorPlan
        tables={tables.map((table) => ({
          id: table.id,
          name: table.name,
          area: table.area,
          seats: table.seats,
          isActive: table.isActive,
          orders: table.orders.map((order) => ({
            id: order.id,
            number: order.number,
            total: order.total,
            guestCount: order.guestCount,
            itemCount: order.itemCount,
            openedAgo: formatRelativeTime(order.openedAt, now),
            customerName: order.customerName,
            kitchen: kitchen.get(order.id) ?? null,
            lines: order.lines,
          })),
        }))}
        canSell={auth.can("POS", "create")}
        canMove={auth.can("POS", "edit")}
      />
    </>
  );
}
