import type { Metadata } from "next";
import { TabsBoard } from "@/components/pos/tabs-board";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listTabs } from "@/lib/data/tables";
import { formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Tabs" };

/** Open tabs: bills running under a name, settled when the customer leaves. */
export default async function TabsPage() {
  const auth = await requirePosCapability("TABS", "POS_ORDERS", "view");
  const branch = await getCurrentBranch();
  const tabs = await listTabs(branch.id);
  const now = new Date();

  return (
    <>
      <PageHeader title="Tabs" description={`Open bills at ${branch.name}. Rounds are added to the same bill until it is settled.`} />
      <TabsBoard
        tabs={tabs.map((tab) => ({
          id: tab.id,
          number: tab.number,
          name: tab.name,
          total: tab.total,
          itemCount: tab.itemCount,
          openedAgo: formatRelativeTime(tab.openedAt, now),
          customerName: tab.customerName,
          lines: tab.lines,
        }))}
        canSell={auth.can("POS", "create")}
        canSplit={auth.can("POS", "edit")}
      />
    </>
  );
}
