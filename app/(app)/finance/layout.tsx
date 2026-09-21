import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("FINANCE", "view");
  return (
    <>
      <PageHeader title="Finance" description="How much came in, how much went out, who owes us, who we owe, and profit." />
      <LinkTabs
        tabs={[
          { label: "Income", href: "/finance/income" },
          { label: "Expenses", href: "/finance/expenses" },
          { label: "Customer Receivables", href: "/finance/receivables" },
          { label: "Supplier Payables", href: "/finance/payables" },
          { label: "Profit", href: "/finance/profit" },
        ]}
      />
      {children}
    </>
  );
}
