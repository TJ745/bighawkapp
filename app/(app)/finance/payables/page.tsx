import type { Metadata } from "next";
import { OutstandingView } from "@/components/finance/outstanding-view";
import { resolveRange } from "@/lib/date-range";
import { requirePermission } from "@/lib/auth/session";
import { groupOutstanding, listPayables } from "@/lib/business/finance";
import { listSupplierOptions } from "@/lib/data/parties";
import { refreshProcurementStatuses } from "@/lib/data/procurement";
import { today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import { isEmailConfigured } from "@/lib/email/mailer";

export const metadata: Metadata = { title: "Supplier Payables" };

const STATUSES = ["unpaid", "partially-paid", "overdue", "paid"] as const;

export default async function PayablesPage({ searchParams }: PageProps<"/finance/payables">) {
  const auth = await requirePermission("FINANCE", "view");
  const raw = await searchParams;
  const todayDate = await today();
  await refreshProcurementStatuses();
  const range = resolveRange(raw, todayDate, "all");
  const status = STATUSES.find((s) => s === raw.status);
  const partyId = typeof raw.party === "string" ? raw.party : undefined;

  const [rows, suppliers, accounts] = await Promise.all([
    listPayables(range, { partyId, status, overdueOnly: raw.overdue === "1" }),
    listSupplierOptions(),
    listPaymentAccounts({ activeOnly: true }),
  ]);
  const docs = rows.map((r) => ({ ...r, party: r.supplier }));

  return (
    <OutstandingView
      kind="payables"
      docs={docs}
      parties={groupOutstanding(docs)}
      partyOptions={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={todayDate}
      canEdit={auth.can("FINANCE", "edit")}
      emailConfigured={await isEmailConfigured()}
    />
  );
}
