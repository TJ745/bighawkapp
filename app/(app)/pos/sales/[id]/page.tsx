import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaleDetailView } from "@/components/pos/sale-detail";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getReturnableLines } from "@/lib/business/pos-returns";
import { getSale } from "@/lib/data/pos";
import { getAppSettings, listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "POS Sale" };

export default async function PosSalePage({ params }: PageProps<"/pos/sales/[id]">) {
  const { id } = await params;
  const auth = await requireModule("POS", "POS", "view");
  const [sale, settings, returnable, accounts] = await Promise.all([
    getSale(id),
    getAppSettings(),
    getReturnableLines(id),
    listPaymentAccounts({ activeOnly: true }),
  ]);
  if (!sale) notFound();

  return (
    <>
      <PageHeader
        title="Sale"
        actions={
          <Button asChild variant="ghost">
            <Link href="/pos/sales">
              <ArrowLeft />
              All sales
            </Link>
          </Button>
        }
      />
      <SaleDetailView
        sale={sale}
        canVoid={auth.can("POS", "delete")}
        canRefund={auth.can("POS", "edit")}
        vatEnabled={settings.vatEnabled}
        returnable={returnable}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
      />
    </>
  );
}
