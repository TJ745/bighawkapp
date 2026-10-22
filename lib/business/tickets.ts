import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Tickets.
 *
 * An event has a number of places and no more. How many are left is a **count of what has been
 * issued minus what has come back** — never a column somebody decrements, because a void, a return
 * and a sale all have to agree about the same number without anyone remembering to adjust it.
 *
 * Selling a ticket is an ordinary POS sale of the event's own item; this file only decides whether
 * there is room.
 */

export type EventForSale = {
  eventId: string;
  name: string;
  startsAt: Date;
  capacity: number;
  placesLeft: number;
  variantId: string;
};

/** The events a cart's lines could be for, by the item that sells them. */
export async function getEventsForVariants(variantIds: string[], branchId: string): Promise<EventForSale[]> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const events = await db.ticketEvent.findMany({
    where: { branchId, isActive: true, variantId: { in: ids } },
    orderBy: { startsAt: "asc" },
    include: { issued: { select: { places: true, returned: true } } },
  });

  return events.map((event) => ({
    eventId: event.id,
    name: event.name,
    startsAt: event.startsAt,
    capacity: event.capacity,
    placesLeft: Math.max(0, event.capacity - event.issued.reduce((sum, row) => sum + (row.places - row.returned), 0)),
    variantId: event.variantId,
  }));
}

/** One event by id, with what is left. */
export async function getEvent(eventId: string, branchId: string): Promise<EventForSale | null> {
  const event = await db.ticketEvent.findFirst({
    where: { id: eventId, branchId },
    include: { issued: { select: { places: true, returned: true } } },
  });
  if (!event) return null;
  return {
    eventId: event.id,
    name: event.name,
    startsAt: event.startsAt,
    capacity: event.capacity,
    placesLeft: Math.max(0, event.capacity - event.issued.reduce((sum, row) => sum + (row.places - row.returned), 0)),
    variantId: event.variantId,
  };
}

/**
 * Whether these places can be sold, and for which item. Whole places only — half a seat is not a
 * thing — and the event's own item is the only one that admits anyone to it.
 */
export function assertPlacesAvailable(event: EventForSale, variantId: string, quantity: number, alreadyInCart: number) {
  if (event.variantId !== variantId) throw new BusinessError(`${event.name} is not sold with that item.`);
  if (!Number.isInteger(quantity)) throw new BusinessError("Tickets are whole places; enter a whole number.");
  const wanted = quantity + alreadyInCart;
  if (wanted > event.placesLeft) {
    throw new BusinessError(
      event.placesLeft === 0 ? `${event.name} is sold out.` : `${event.name} has only ${event.placesLeft} place${event.placesLeft === 1 ? "" : "s"} left.`,
    );
  }
}

/** Records the places a sold line took. */
export async function issueTickets(tx: Prisma.TransactionClient, input: { eventId: string; saleItemId: string; places: number }) {
  if (input.places <= 0) return;
  await tx.ticketIssued.create({ data: { eventId: input.eventId, saleItemId: input.saleItemId, places: input.places } });
}

/**
 * Gives places back when a sale is voided or a ticket returned. `portion` is how much of the line
 * is coming back, and places are whole, so a part-return rounds up but never exceeds the line.
 */
export async function returnTickets(tx: Prisma.TransactionClient, saleItemId: string, portion = 1) {
  if (portion <= 0) return;
  const issued = await tx.ticketIssued.findUnique({ where: { saleItemId } });
  if (!issued) return;
  const outstanding = issued.places - issued.returned;
  if (outstanding <= 0) return;
  const giveBack = Math.min(outstanding, Math.max(1, Math.ceil(issued.places * Math.min(1, portion))));
  await tx.ticketIssued.update({ where: { id: issued.id }, data: { returned: issued.returned + giveBack } });
}
