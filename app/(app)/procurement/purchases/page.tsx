import type { Metadata } from "next";
import { PurchasesTable } from "@/components/procurement/purchases-table";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listPurchases } from "@/lib/data/procurement";
import { today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage({ searchParams }: PageProps<"/procurement/purchases">) {
  const auth = await requirePermission("PROCUREMENT", "view");
  const params = parseListParams(await searchParams);
  const [{ items, total }, accounts, todayDate] = await Promise.all([
    listPurchases(params),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <>
      <PageHeader title="Purchases" description="Goods and services bought from suppliers and the payments made against them." />
      <PurchasesTable
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can("PROCUREMENT", "create")}
        canEdit={auth.can("PROCUREMENT", "edit")}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        today={todayDate}
      />
    </>
  );
}
