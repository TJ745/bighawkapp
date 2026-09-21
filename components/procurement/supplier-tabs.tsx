import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPurchases, listSupplierPayments, listSupplierQuotations } from "@/lib/data/procurement";
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
