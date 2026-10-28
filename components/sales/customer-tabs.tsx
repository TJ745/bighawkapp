import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCustomerAdvances, listSettleableInvoices } from "@/lib/data/advances";
import { listCustomerPayments, listInvoices, listQuotations, today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import type { AuthContext } from "@/lib/auth/session";
import { PartyAdvances } from "@/components/parties/party-advances";
import { CustomerPaymentsTable } from "./customer-payments-table";
import { InvoicesTable } from "./invoices-table";
import { QuotationsTable } from "./quotations-table";

// Server components rendered inside the customer profile tabs.

const ALL = { q: "", filter: "all", page: 1 };

export async function CustomerQuotationsTab({ customerId, canCreate, canEdit }: { customerId: string; canCreate: boolean; canEdit: boolean }) {
  const { items, total } = await listQuotations({ ...ALL }, customerId);
  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/sales/quotations/new?customer=${customerId}`}>
              <Plus />
              New Quotation
            </Link>
          </Button>
        </div>
      ) : null}
      <QuotationsTable items={items} total={total} page={1} hasQuery={false} canCreate={canCreate} canEdit={canEdit} embedded />
    </div>
  );
}

export async function CustomerInvoicesTab({ customerId, canCreate, canEdit }: { customerId: string; canCreate: boolean; canEdit: boolean }) {
  const [{ items, total }, accounts, todayDate] = await Promise.all([
    listInvoices({ ...ALL }, customerId),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/sales/invoices/new?customer=${customerId}`}>
              <Plus />
              New Invoice
            </Link>
          </Button>
        </div>
      ) : null}
      <InvoicesTable
        items={items}
        total={total}
        page={1}
        hasQuery={false}
        canCreate={canCreate}
        canEdit={canEdit}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        today={todayDate}
        embedded
      />
    </div>
  );
}

export async function CustomerPaymentsTab({ customerId }: { customerId: string }) {
  const payments = await listCustomerPayments(customerId);
  return <CustomerPaymentsTable payments={payments} />;
}

/**
 * Money the customer has paid in advance, and what it has gone towards.
 *
 * The invoices offered are the ones with money still owing, so an advance can only be put against
 * something that is actually outstanding — the engine refuses anything else regardless.
 */
export async function CustomerAdvancesTab({ customerId, customerName, auth }: { customerId: string; customerName: string; auth: AuthContext }) {
  const [advances, invoices, accounts, todayDate] = await Promise.all([
    listCustomerAdvances(customerId),
    listSettleableInvoices(customerId),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <PartyAdvances
      kind="customer"
      partyId={customerId}
      partyName={customerName}
      advances={advances}
      documents={invoices}
      accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
      today={todayDate}
      canEdit={auth.can("SALES", "edit")}
      canDelete={auth.can("SALES", "delete")}
    />
  );
}
