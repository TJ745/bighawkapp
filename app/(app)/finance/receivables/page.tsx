import type { Metadata } from "next";
import { OutstandingView } from "@/components/finance/outstanding-view";
import { resolveRange } from "@/lib/date-range";
import { requirePermission } from "@/lib/auth/session";
import { groupOutstanding, listReceivables } from "@/lib/business/finance";
import { listCustomerOptions } from "@/lib/data/parties";
import { refreshSalesStatuses, today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import { isEmailConfigured } from "@/lib/email/mailer";

export const metadata: Metadata = { title: "Customer Receivables" };

const STATUSES = ["unpaid", "partially-paid", "overdue", "paid"] as const;

export default async function ReceivablesPage({ searchParams }: PageProps<"/finance/receivables">) {
  const auth = await requirePermission("FINANCE", "view");
  const raw = await searchParams;
  const todayDate = await today();
  await refreshSalesStatuses();
  const range = resolveRange(raw, todayDate, "all");
  const status = STATUSES.find((s) => s === raw.status);
  const partyId = typeof raw.party === "string" ? raw.party : undefined;

  const [rows, customers, accounts] = await Promise.all([
    listReceivables(range, { partyId, status, overdueOnly: raw.overdue === "1" }),
    listCustomerOptions(),
    listPaymentAccounts({ activeOnly: true }),
  ]);
  const docs = rows.map((r) => ({ ...r, party: r.customer }));

  return (
    <OutstandingView
      kind="receivables"
      docs={docs}
      parties={groupOutstanding(docs)}
      partyOptions={customers.map((c) => ({ id: c.id, name: c.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={todayDate}
      canEdit={auth.can("FINANCE", "edit")}
      emailConfigured={await isEmailConfigured()}
    />
  );
}
