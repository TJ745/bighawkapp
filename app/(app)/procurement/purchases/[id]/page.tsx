import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PurchaseDetailView } from "@/components/procurement/purchase-detail";
import { requirePermission } from "@/lib/auth/session";
import { getPurchase } from "@/lib/data/procurement";
import { today } from "@/lib/data/sales";
import { getAppSettings, listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchasePage({ params }: PageProps<"/procurement/purchases/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("PROCUREMENT", "view");
  const [purchase, settings, accounts, todayDate] = await Promise.all([
    getPurchase(id),
    getAppSettings(),
    listPaymentAccounts({ activeOnly: true }),
    today(),
  ]);
  if (!purchase) notFound();
  return (
    <PurchaseDetailView
      purchase={purchase}
      canEdit={auth.can("PROCUREMENT", "edit")}
      showVat={settings.vatEnabled}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={todayDate}
    />
  );
}
