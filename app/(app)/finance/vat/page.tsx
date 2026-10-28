import type { Metadata } from "next";
import { VatReturnView } from "@/components/finance/vat-return-view";
import { resolveRange } from "@/lib/date-range";
import { requirePermission } from "@/lib/auth/session";
import { getVatReturn } from "@/lib/business/vat-return";
import { today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "VAT" };

export default async function VatPage({ searchParams }: PageProps<"/finance/vat">) {
  await requirePermission("FINANCE", "view");
  const raw = await searchParams;
  const todayDate = await today();
  // A VAT period is a quarter far more often than a month, but the picker offers both and the
  // default matches every other Finance screen so the dates do not jump about.
  const range = resolveRange(raw, todayDate, "this-month");
  const [data, settings] = await Promise.all([getVatReturn(range), getAppSettings()]);
  return <VatReturnView data={data} today={todayDate} vatEnabled={settings.vatEnabled} />;
}
