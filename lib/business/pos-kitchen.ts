import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { PosKitchenStatus } from "@/lib/generated/prisma/enums";
import { round3 } from "./inventory";

/**
 * The kitchen side of an order.
 *
 * A ticket is one **round** sent to the kitchen, and it is a snapshot: adding a round rewrites the
 * bill's lines, so the kitchen's copy has to stand on its own. What has not been sent yet is
 * therefore worked out by comparing quantities — current bill minus everything already ticketed —
 * grouped by item *and* its chosen options, so a plain latte and an oat latte are never conflated.
 */

/** The chosen options in a stable order; two lines match only if their options match. */
export function optionSignature(optionIds: (string | null)[]) {
  return optionIds
    .filter((id): id is string => Boolean(id))
    .slice()
    .sort()
    .join("|");
}

type Pending = {
  variantId: string | null;
  name: string;
  unit: string;
  quantity: number;
  options: string | null;
  signature: string;
};

/**
 * What is on the bill but has not reached the kitchen, and what reached the kitchen but is no
 * longer on the bill (an item removed after it was sent — the cook needs telling).
 */
export async function kitchenDelta(saleId: string) {
  const sale = await db.posSale.findUnique({
    where: { id: saleId },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { modifiers: { orderBy: { sortOrder: "asc" } } } },
      kitchenTickets: { where: { status: { not: "CANCELLED" } }, include: { items: true } },
    },
  });
  if (!sale) throw new BusinessError("That order no longer exists.");

  const onBill = new Map<string, Pending>();
  for (const item of sale.items) {
    const signature = optionSignature(item.modifiers.map((m) => m.optionId));
    const key = `${item.variantId ?? item.name}::${signature}`;
    const existing = onBill.get(key);
    const quantity = num(item.quantity);
    if (existing) {
      existing.quantity = round3(existing.quantity + quantity);
      continue;
    }
    onBill.set(key, {
      variantId: item.variantId,
      name: item.name,
      unit: item.unit,
      quantity,
      options: item.modifiers.length > 0 ? item.modifiers.map((m) => m.optionName).join(", ") : null,
      signature,
    });
  }

  const sent = new Map<string, number>();
  for (const ticket of sale.kitchenTickets) {
    for (const item of ticket.items) {
      const key = `${item.variantId ?? item.name}::${item.signature}`;
      sent.set(key, round3((sent.get(key) ?? 0) + num(item.quantity)));
    }
  }

  const toSend: Pending[] = [];
  for (const [key, line] of onBill) {
    const already = sent.get(key) ?? 0;
    const outstanding = round3(line.quantity - already);
    if (outstanding > 0) toSend.push({ ...line, quantity: outstanding });
  }

  const removed: { name: string; options: string | null; quantity: number }[] = [];
  for (const [key, quantity] of sent) {
    const still = onBill.get(key)?.quantity ?? 0;
    const gone = round3(quantity - still);
    if (gone <= 0) continue;
    const fromTicket = sale.kitchenTickets.flatMap((t) => t.items).find((i) => `${i.variantId ?? i.name}::${i.signature}` === key)!;
    removed.push({ name: fromTicket.name, options: fromTicket.options, quantity: gone });
  }

  return { saleId: sale.id, saleNumber: sale.number, status: sale.status, toSend, removed, rounds: sale.kitchenTickets.length };
}

/** Sends everything not yet sent as one new round. */
export async function sendToKitchen(input: { saleId: string; branchId: string; note?: string | null; user: { id: string; name: string } }) {
  const sale = await db.posSale.findUnique({ where: { id: input.saleId }, select: { id: true, number: true, status: true, branchId: true } });
  if (!sale) throw new BusinessError("That order no longer exists.");
  if (sale.branchId !== input.branchId) throw new BusinessError("That order belongs to another branch.");
  if (sale.status === "VOIDED") throw new BusinessError("A voided order cannot be sent to the kitchen.");

  const delta = await kitchenDelta(sale.id);
  if (delta.toSend.length === 0) throw new BusinessError("Everything on this order has already been sent to the kitchen.");

  const ticket = await db.posKitchenTicket.create({
    data: {
      saleId: sale.id,
      branchId: sale.branchId,
      round: delta.rounds + 1,
      note: input.note ?? null,
      sentById: input.user.id,
      sentByName: input.user.name,
      items: {
        create: delta.toSend.map((line, index) => ({
          variantId: line.variantId,
          name: line.name,
          unit: line.unit,
          quantity: line.quantity,
          options: line.options,
          signature: line.signature,
          sortOrder: index,
        })),
      },
    },
    select: { id: true, round: true },
  });

  return { id: ticket.id, round: ticket.round, saleNumber: sale.number, lines: delta.toSend.length };
}

/** Forward only — a ticket never goes back a stage; a mistake is cancelled instead. */
const NEXT: Record<PosKitchenStatus, PosKitchenStatus[]> = {
  NEW: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  CANCELLED: [],
};

export function kitchenTransitions(status: PosKitchenStatus) {
  return NEXT[status];
}

export async function advanceTicket(input: { ticketId: string; status: PosKitchenStatus; branchId: string; user: { id: string; name: string } }) {
  const ticket = await db.posKitchenTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, branchId: true, round: true, sale: { select: { number: true } } },
  });
  if (!ticket) throw new BusinessError("That ticket no longer exists.");
  if (ticket.branchId !== input.branchId) throw new BusinessError("That ticket belongs to another branch.");
  if (!NEXT[ticket.status].includes(input.status)) {
    throw new BusinessError(`A ticket that is ${ticket.status.toLowerCase()} cannot be marked ${input.status.toLowerCase()}.`);
  }

  const now = new Date();
  await db.posKitchenTicket.update({
    where: { id: ticket.id },
    data: {
      status: input.status,
      // Each stage keeps its own time, which is what makes "how long did this take" answerable.
      ...(input.status === "PREPARING" ? { startedAt: now } : {}),
      ...(input.status === "READY" ? { readyAt: now } : {}),
      ...(input.status === "SERVED" ? { servedAt: now } : {}),
    },
  });

  return { saleNumber: ticket.sale.number, round: ticket.round, status: input.status };
}
