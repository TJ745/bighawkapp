import type { Metadata } from "next";
import { InvoicesTable } from "@/components/sales/invoices-table";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listInvoices, today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/sales/invoices">) {
  const auth = await requirePermission("SALES", "view");
  const params = parseListParams(await searchParams);
  const [{ items, total }, accounts, todayDate] = await Promise.all([
    listInvoices(params),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <>
      <PageHeader title="Invoices" description="Bills issued to customers and the payments received against them." />
      <InvoicesTable
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can("SALES", "create")}
        canEdit={auth.can("SALES", "edit")}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        today={todayDate}
      />
    </>
  );
}
