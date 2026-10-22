import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { StayStatus } from "@/lib/generated/prisma/enums";
import { nextDocumentNumber } from "./numbering";

/**
 * Rooms and stays.
 *
 * A stay is a room between two dates. What the guest owes is a **folio**: a held POS sale pointing
 * at the stay, so a drink from the bar and a night in the room arrive by the same path as every
 * other charge, and check-out is just settling a held bill.
 *
 * Nights are counted the way hotels count them: the night of the check-out date is not charged, so
 * one night is check-in today and check-out tomorrow.
 */

const NEXT: Record<StayStatus, StayStatus[]> = {
  BOOKED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [],
  CANCELLED: ["BOOKED"],
  NO_SHOW: [],
};

export function stayTransitions(status: StayStatus) {
  return NEXT[status];
}

/** Nights between two dates. Same-day stays count as one night, which is what is charged. */
export function nightsBetween(checkIn: string, checkOut: string) {
  const from = new Date(`${checkIn}T00:00:00.000Z`).getTime();
  const to = new Date(`${checkOut}T00:00:00.000Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) throw new BusinessError("Those dates are not valid.");
  if (to < from) throw new BusinessError("Check-out cannot be before check-in.");
  return Math.max(1, Math.round((to - from) / (24 * 60 * 60_000)));
}

/**
 * Refuses a stay that overlaps one the room already has. Two stays overlap when each starts before
 * the other ends — and because the check-out day is not charged, a guest leaving on the day the
 * next arrives is fine.
 */
export async function assertRoomFree(input: { roomId: string; checkIn: string; checkOut: string; ignoreStayId?: string }) {
  const clash = await db.stay.findFirst({
    where: {
      roomId: input.roomId,
      id: input.ignoreStayId ? { not: input.ignoreStayId } : undefined,
      status: { in: ["BOOKED", "CHECKED_IN"] },
      checkIn: { lt: new Date(`${input.checkOut}T00:00:00.000Z`) },
      checkOut: { gt: new Date(`${input.checkIn}T00:00:00.000Z`) },
    },
    select: { number: true, guestName: true, room: { select: { name: true } } },
  });
  if (clash) throw new BusinessError(`${clash.room.name} already has ${clash.guestName} (${clash.number}) over those dates.`);
}

export type CreateStayInput = {
  branchId: string;
  roomId: string;
  customerId: string | null;
  guestName: string;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  nightlyRate: number | null;
  note: string | null;
  user: { id: string; name: string };
};

/** Books a room. The rate is snapshotted, so a later price change does not rewrite this stay. */
export async function createStay(input: CreateStayInput) {
  const room = await db.room.findUnique({
    where: { id: input.roomId },
    select: { id: true, name: true, branchId: true, isActive: true, capacity: true, nightlyRate: true },
  });
  if (!room || room.branchId !== input.branchId) throw new BusinessError("That room is not at this branch.");
  if (!room.isActive) throw new BusinessError(`${room.name} is not in use.`);
  if (input.guests > room.capacity) throw new BusinessError(`${room.name} sleeps ${room.capacity}.`);

  const nights = nightsBetween(input.checkIn, input.checkOut);
  await assertRoomFree({ roomId: room.id, checkIn: input.checkIn, checkOut: input.checkOut });

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "STAY", new Date());
    const stay = await tx.stay.create({
      data: {
        number,
        branchId: input.branchId,
        roomId: room.id,
        customerId: input.customerId,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        checkIn: new Date(`${input.checkIn}T00:00:00.000Z`),
        checkOut: new Date(`${input.checkOut}T00:00:00.000Z`),
        nights,
        nightlyRate: input.nightlyRate ?? num(room.nightlyRate),
        guests: input.guests,
        note: input.note,
        createdById: input.user.id,
        createdByName: input.user.name,
      },
      select: { id: true, number: true },
    });
    return { id: stay.id, number: stay.number, nights, roomName: room.name };
  });
}

export async function setStayStatus(input: { stayId: string; status: StayStatus; branchId: string }) {
  const stay = await db.stay.findUnique({
    where: { id: input.stayId },
    select: { id: true, number: true, status: true, branchId: true, guestName: true, folio: { select: { id: true, status: true, grandTotal: true } } },
  });
  if (!stay) throw new BusinessError("That stay no longer exists.");
  if (stay.branchId !== input.branchId) throw new BusinessError("That stay belongs to another branch.");
  if (!NEXT[stay.status].includes(input.status)) {
    throw new BusinessError(`A stay that is ${label(stay.status)} cannot be marked ${label(input.status)}.`);
  }
  // Checking out is what settling the folio does, so it is not something to click.
  if (input.status === "CHECKED_OUT") {
    throw new BusinessError("Settle the folio at the till; the stay checks itself out once the bill is paid.");
  }
  if (input.status === "CANCELLED" && stay.folio && num(stay.folio.grandTotal) > 0) {
    throw new BusinessError("There are charges on this folio. Settle them before cancelling the stay.");
  }

  await db.stay.update({ where: { id: stay.id }, data: { status: input.status } });
  return { number: stay.number, guestName: stay.guestName, status: input.status };
}

/**
 * The room's own charge for the stay: nights × the agreed rate, as a line the folio can carry.
 * Only possible where the room has an item to charge it with, which is how it reaches the
 * catalogue, VAT and the receipt like everything else.
 */
export async function roomNightLine(stayId: string) {
  const stay = await db.stay.findUnique({
    where: { id: stayId },
    select: { nights: true, nightlyRate: true, room: { select: { variantId: true, name: true } } },
  });
  if (!stay) throw new BusinessError("That stay no longer exists.");
  if (!stay.room.variantId) return null;
  return { variantId: stay.room.variantId, quantity: stay.nights, unitPrice: num(stay.nightlyRate) };
}

function label(status: StayStatus) {
  return status.toLowerCase().replace("_", " ");
}
