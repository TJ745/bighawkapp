import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import type { PosKitchenStatus } from "@/lib/generated/prisma/enums";

/** Reads for the kitchen display and for the kitchen state shown on the floor plan. */

const LIVE: PosKitchenStatus[] = ["NEW", "PREPARING", "READY"];

/**
 * The board: everything still cooking, plus what was served or cancelled recently so a cook can
 * see what just left. Tickets are snapshots, so this never has to re-read the bill — except to
 * notice that the bill no longer covers what was sent.
 */
export async function listKitchenTickets(branchId: string, options?: { recentMinutes?: number }) {
  const now = Date.now();
  const since = new Date(now - (options?.recentMinutes ?? 60) * 60_000);
  const tickets = await db.posKitchenTicket.findMany({
    where: { branchId, OR: [{ status: { in: LIVE } }, { status: { in: ["SERVED", "CANCELLED"] }, sentAt: { gte: since } }] },
    orderBy: { sentAt: "asc" },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      sale: {
        select: {
          id: true,
          number: true,
          status: true,
          note: true,
          orderNumber: true,
          guestCount: true,
          table: { select: { name: true } },
          customer: { select: { name: true } },
          items: { select: { variantId: true, name: true, quantity: true, modifiers: { select: { optionId: true } } } },
        },
      },
    },
  });

  return tickets.map((ticket) => {
    // What was sent but is no longer on the bill: the cook is making something nobody is paying for.
    const onBill = new Map<string, number>();
    for (const item of ticket.sale.items) {
      const signature = item.modifiers
        .map((m) => m.optionId)
        .filter((id): id is string => Boolean(id))
        .slice()
        .sort()
        .join("|");
      const key = `${item.variantId ?? item.name}::${signature}`;
      onBill.set(key, (onBill.get(key) ?? 0) + num(item.quantity));
    }
    const changed = ticket.items.some((item) => (onBill.get(`${item.variantId ?? item.name}::${item.signature}`) ?? 0) < num(item.quantity));

    return {
      id: ticket.id,
      round: ticket.round,
      status: ticket.status,
      note: ticket.note,
      sentAt: ticket.sentAt,
      /** Minutes since it was sent, measured once here so every screen shows the same number. */
      waitingMinutes: Math.max(0, Math.round((now - ticket.sentAt.getTime()) / 60_000)),
      startedAt: ticket.startedAt,
      readyAt: ticket.readyAt,
      sentByName: ticket.sentByName,
      saleId: ticket.sale.id,
      saleNumber: ticket.sale.number,
      orderNumber: ticket.sale.orderNumber,
      saleStatus: ticket.sale.status,
      tableName: ticket.sale.table?.name ?? null,
      customerName: ticket.sale.customer?.name ?? null,
      guestCount: ticket.sale.guestCount,
      orderNote: ticket.sale.note,
      /** The bill changed after this went to the kitchen — shown as a warning on the card. */
      billChanged: changed,
      items: ticket.items.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: num(item.quantity),
        options: item.options,
      })),
    };
  });
}

export type KitchenTicket = Awaited<ReturnType<typeof listKitchenTickets>>[number];

/** The kitchen state of each open order, for the floor plan's badges. */
export async function kitchenStateBySale(saleIds: string[]) {
  if (saleIds.length === 0) return new Map<string, PosKitchenStatus>();
  const tickets = await db.posKitchenTicket.findMany({
    where: { saleId: { in: saleIds }, status: { in: [...LIVE, "SERVED"] } },
    select: { saleId: true, status: true },
  });

  // The least advanced live ticket is what the floor should see: one plate still cooking means
  // the table is still waiting, however many are ready.
  const rank: Record<string, number> = { NEW: 0, PREPARING: 1, READY: 2, SERVED: 3 };
  const state = new Map<string, PosKitchenStatus>();
  for (const ticket of tickets) {
    const current = state.get(ticket.saleId);
    if (!current || rank[ticket.status] < rank[current]) state.set(ticket.saleId, ticket.status);
  }
  return state;
}
