import type { Metadata } from "next";
import { KitchenBoard, type KitchenCard } from "@/components/pos/kitchen-board";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { listKitchenTickets } from "@/lib/data/kitchen";
import { getCurrentBranch } from "@/lib/data/platform";

export const metadata: Metadata = { title: "Kitchen" };

/** The kitchen display. Refreshes itself, so it can live on a screen above the pass. */
export default async function KitchenPage() {
  const auth = await requirePosCapability("KITCHEN", "POS_KITCHEN", "view");
  const branch = await getCurrentBranch();
  const tickets = await listKitchenTickets(branch.id);

  const cards: KitchenCard[] = tickets.map((ticket) => ({
    id: ticket.id,
    round: ticket.round,
    status: ticket.status,
    note: ticket.note,
    orderNote: ticket.orderNote,
    saleNumber: ticket.saleNumber,
    orderNumber: ticket.orderNumber,
    tableName: ticket.tableName,
    customerName: ticket.customerName,
    guestCount: ticket.guestCount,
    billChanged: ticket.billChanged,
    waitingMinutes: ticket.waitingMinutes,
    items: ticket.items,
  }));

  return (
    <>
      <PageHeader title="Kitchen" description={`What ${branch.name} is cooking, oldest first. The board refreshes itself every few seconds.`} />
      <KitchenBoard
        tickets={cards.filter((card) => card.status === "NEW" || card.status === "PREPARING" || card.status === "READY")}
        served={cards.filter((card) => card.status === "SERVED" || card.status === "CANCELLED").slice(-12)}
        canCook={auth.can("POS", "edit")}
      />
    </>
  );
}
