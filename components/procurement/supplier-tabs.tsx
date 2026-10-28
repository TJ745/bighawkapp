import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPurchases, listSupplierPayments, listSupplierQuotations } from "@/lib/data/procurement";
import { listSettleablePurchases, listSupplierAdvances } from "@/lib/data/supplier-advances";
import type { AuthContext } from "@/lib/auth/session";
import { PartyAdvances } from "@/components/parties/party-advances";
import { today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";
import { PurchasesTable } from "./purchases-table";
import { SupplierPaymentsTable } from "./supplier-payments-table";
import { SupplierQuotationsTable } from "./supplier-quotations-table";

// Server components rendered inside the supplier profile tabs.

const ALL = { q: "", filter: "all", page: 1 };

export async function SupplierQuotationsTab({ supplierId, canCreate, canEdit }: { supplierId: string; canCreate: boolean; canEdit: boolean }) {
  const { items, total } = await listSupplierQuotations({ ...ALL }, supplierId);
  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/procurement/supplier-quotations/new?supplier=${supplierId}`}>
              <Plus />
              New Supplier Quotation
            </Link>
          </Button>
        </div>
      ) : null}
      <SupplierQuotationsTable items={items} total={total} page={1} hasQuery={false} canCreate={canCreate} canEdit={canEdit} embedded />
    </div>
  );
}

export async function SupplierPurchasesTab({ supplierId, canCreate, canEdit }: { supplierId: string; canCreate: boolean; canEdit: boolean }) {
  const [{ items, total }, accounts, todayDate] = await Promise.all([
    listPurchases({ ...ALL }, { supplierId }),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={`/procurement/purchases/new?supplier=${supplierId}`}>
              <Plus />
              New Purchase
            </Link>
          </Button>
        </div>
      ) : null}
      <PurchasesTable
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

export async function SupplierPaymentsTab({ supplierId }: { supplierId: string }) {
  const payments = await listSupplierPayments(supplierId);
  return <SupplierPaymentsTable payments={payments} />;
}

/**
 * Money paid to the supplier up front, and what it has gone towards.
 *
 * The purchases offered are the ones with money still owing, so a prepayment can only be put
 * against something actually outstanding — the engine refuses anything else regardless.
 */
export async function SupplierAdvancesTab({ supplierId, supplierName, auth }: { supplierId: string; supplierName: string; auth: AuthContext }) {
  const [advances, purchases, accounts, todayDate] = await Promise.all([
    listSupplierAdvances(supplierId),
    listSettleablePurchases(supplierId),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  return (
    <PartyAdvances
      kind="supplier"
      partyId={supplierId}
      partyName={supplierName}
      advances={advances}
      documents={purchases}
      accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
      today={todayDate}
      canEdit={auth.can("PROCUREMENT", "edit")}
      canDelete={auth.can("PROCUREMENT", "delete")}
    />
  );
}
