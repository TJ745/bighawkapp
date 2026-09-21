import { InvoicesTable } from "@/components/sales/invoices-table";
import { QuotationsTable } from "@/components/sales/quotations-table";
import { PurchasesTable } from "@/components/procurement/purchases-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ShieldX } from "lucide-react";
import type { AuthContext } from "@/lib/auth/session";
import { listPurchases } from "@/lib/data/procurement";
import { listInvoices, listQuotations, today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import { listProjects } from "@/lib/data/projects";
import { ProjectsTable } from "./projects-table";

// Server components for the project profile tabs and the customer profile "Projects" tab.

const ALL = { q: "", filter: "all", page: 1 };

export async function ProjectSalesTab({ projectId, auth }: { projectId: string; auth: AuthContext }) {
  if (!auth.can("SALES", "view")) return <NoAccess module="Sales" />;
  const [quotations, invoices, accounts, todayDate] = await Promise.all([
    listQuotations({ ...ALL }, undefined, projectId),
    listInvoices({ ...ALL }, undefined, projectId),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Invoices</h3>
        <InvoicesTable
          items={invoices.items}
          total={invoices.total}
          page={1}
          hasQuery={false}
          canCreate={auth.can("SALES", "create")}
          canEdit={auth.can("SALES", "edit")}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          today={todayDate}
          embedded
        />
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Quotations</h3>
        <QuotationsTable
          items={quotations.items}
          total={quotations.total}
          page={1}
          hasQuery={false}
          canCreate={auth.can("SALES", "create")}
          canEdit={auth.can("SALES", "edit")}
          embedded
        />
      </section>
    </div>
  );
}

export async function ProjectPurchasesTab({ projectId, auth }: { projectId: string; auth: AuthContext }) {
  if (!auth.can("PROCUREMENT", "view")) return <NoAccess module="Procurement" />;
  const [{ items, total }, accounts, todayDate] = await Promise.all([
    listPurchases({ ...ALL }, { projectId }),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <PurchasesTable
      items={items}
      total={total}
      page={1}
      hasQuery={false}
      canCreate={auth.can("PROCUREMENT", "create")}
      canEdit={auth.can("PROCUREMENT", "edit")}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={todayDate}
      embedded
    />
  );
}

export async function CustomerProjectsTab({ customerId, auth }: { customerId: string; auth: AuthContext }) {
  const { items, total } = await listProjects({ ...ALL }, customerId);
  return (
    <ProjectsTable
      items={items}
      total={total}
      page={1}
      hasQuery={false}
      canCreate={auth.can("PROJECTS", "create")}
      canEdit={auth.can("PROJECTS", "edit")}
      customerId={customerId}
      embedded
    />
  );
}

function NoAccess({ module }: { module: string }) {
  return <EmptyState icon={ShieldX} title={`No access to ${module}`} description="Ask your administrator if you need to see these records." />;
}
