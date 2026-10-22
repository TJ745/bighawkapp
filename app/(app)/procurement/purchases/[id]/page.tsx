import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PurchaseDetailView } from "@/components/procurement/purchase-detail";
import { requirePermission } from "@/lib/auth/session";
import { getReceivableLines } from "@/lib/business/receiving";
import { getCurrentBranch, listActiveBranches } from "@/lib/data/platform";
import { getPurchase } from "@/lib/data/procurement";
import { listReceiptsForPurchase, listReceivableItems } from "@/lib/data/receiving";
import { today } from "@/lib/data/sales";
import { getAppSettings, listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchasePage({ params }: PageProps<"/procurement/purchases/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("PROCUREMENT", "view");
  /**
   * Receiving goods needs the POS module (stock lives there) plus the right to maintain inventory.
   * Without both, the purchase still works — there is simply no shelf to put it on.
   */
  const canReceive = auth.hasModule("POS") && auth.can("PROCUREMENT", "edit") && auth.can("INVENTORY", "edit");
  const [purchase, settings, accounts, todayDate, receivable, receipts, branches, currentBranch] = await Promise.all([
    getPurchase(id),
    getAppSettings(),
    listPaymentAccounts({ activeOnly: true }),
    today(),
    canReceive ? getReceivableLines(id) : Promise.resolve([]),
    canReceive ? listReceiptsForPurchase(id) : Promise.resolve([]),
    canReceive ? listActiveBranches() : Promise.resolve([]),
    canReceive ? getCurrentBranch() : Promise.resolve(null),
  ]);
  if (!purchase) notFound();
  const receivableItems = canReceive && currentBranch ? await listReceivableItems(currentBranch.id) : [];
  return (
    <PurchaseDetailView
      purchase={purchase}
      canEdit={auth.can("PROCUREMENT", "edit")}
      showVat={settings.vatEnabled}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={todayDate}
      canReceive={canReceive}
      receivable={receivable}
      receivableItems={receivableItems}
      branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      currentBranchId={currentBranch?.id ?? null}
      receipts={receipts}
    />
  );
}
