import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { refreshRentalStatuses } from "@/lib/business/rentals";
import { round2 } from "@/lib/business/totals";

/** Reads for repair jobs, ticketed events, rooms and rentals. */

// --- Work orders --------------------------------------------------------------

export async function listWorkOrders(branchId: string, options?: { openOnly?: boolean }) {
  const rows = await db.workOrder.findMany({
    where: { branchId, ...(options?.openOnly ? { status: { notIn: ["DELIVERED", "CANCELLED"] } } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      staff: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      sale: { select: { id: true, number: true, grandTotal: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    customerId: row.customer?.id ?? null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    itemName: row.itemName,
    serialNumber: row.serialNumber,
    faultReported: row.faultReported,
    diagnosis: row.diagnosis,
    estimate: row.estimate === null ? null : num(row.estimate),
    status: row.status,
    staffId: row.staff?.id ?? null,
    staffName: row.staff?.name ?? null,
    promisedAt: row.promisedAt,
    note: row.note,
    saleNumber: row.sale?.number ?? null,
    paid: row.sale ? num(row.sale.grandTotal) : null,
    createdAt: row.createdAt,
  }));
}

export type WorkOrderRow = Awaited<ReturnType<typeof listWorkOrders>>[number];

/** One job, for taking payment at the till. */
export async function getWorkOrder(workOrderId: string, branchId: string) {
  const row = await db.workOrder.findFirst({
    where: { id: workOrderId, branchId },
    select: { id: true, number: true, customerId: true, customerName: true, itemName: true, estimate: true, status: true, saleId: true },
  });
  if (!row) return null;
  return { ...row, estimate: row.estimate === null ? null : num(row.estimate) };
}

// --- Tickets ------------------------------------------------------------------

export async function listTicketEvents(branchId: string, options?: { upcomingOnly?: boolean }) {
  const rows = await db.ticketEvent.findMany({
    where: { branchId, ...(options?.upcomingOnly ? { isActive: true, startsAt: { gte: new Date(Date.now() - 12 * 60 * 60_000) } } : {}) },
    orderBy: { startsAt: "asc" },
    take: 200,
    include: {
      variant: { select: { id: true, name: true, salePrice: true, item: { select: { name: true, salePrice: true } } } },
      issued: { select: { places: true, returned: true } },
    },
  });

  return rows.map((row) => {
    const taken = row.issued.reduce((sum, issued) => sum + (issued.places - issued.returned), 0);
    return {
      id: row.id,
      name: row.name,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      capacity: row.capacity,
      sold: taken,
      placesLeft: Math.max(0, row.capacity - taken),
      variantId: row.variant.id,
      ticketName: row.variant.name && row.variant.name !== row.variant.item.name ? `${row.variant.item.name} — ${row.variant.name}` : row.variant.item.name,
      price: row.variant.salePrice === null ? num(row.variant.item.salePrice) : num(row.variant.salePrice),
      note: row.note,
      isActive: row.isActive,
    };
  });
}

export type TicketEventRow = Awaited<ReturnType<typeof listTicketEvents>>[number];

// --- Rooms --------------------------------------------------------------------

export async function listRooms(branchId: string, options?: { activeOnly?: boolean }) {
  const rows = await db.room.findMany({
    where: { branchId, ...(options?.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ roomType: "asc" }, { name: "asc" }],
    include: {
      variant: { select: { id: true, name: true, item: { select: { name: true } } } },
      stays: {
        where: { status: { in: ["BOOKED", "CHECKED_IN"] } },
        orderBy: { checkIn: "asc" },
        select: { id: true, number: true, guestName: true, checkIn: true, checkOut: true, status: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    roomType: row.roomType,
    capacity: row.capacity,
    nightlyRate: num(row.nightlyRate),
    variantId: row.variant?.id ?? null,
    nightItemName: row.variant ? (row.variant.name && row.variant.name !== row.variant.item.name ? `${row.variant.item.name} — ${row.variant.name}` : row.variant.item.name) : null,
    isActive: row.isActive,
    upcoming: row.stays,
  }));
}

export type RoomRow = Awaited<ReturnType<typeof listRooms>>[number];

export async function listStays(branchId: string, options?: { openOnly?: boolean }) {
  const rows = await db.stay.findMany({
    where: { branchId, ...(options?.openOnly ? { status: { in: ["BOOKED", "CHECKED_IN"] } } : {}) },
    orderBy: [{ status: "asc" }, { checkIn: "asc" }],
    take: 200,
    include: {
      room: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      folio: { select: { id: true, number: true, grandTotal: true, status: true, _count: { select: { items: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    roomId: row.room.id,
    roomName: row.room.name,
    customerId: row.customer?.id ?? null,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    nights: row.nights,
    nightlyRate: num(row.nightlyRate),
    guests: row.guests,
    status: row.status,
    note: row.note,
    folioId: row.folio?.id ?? null,
    folioNumber: row.folio?.number ?? null,
    folioTotal: row.folio ? num(row.folio.grandTotal) : 0,
    folioLines: row.folio?._count.items ?? 0,
    /** What the room itself comes to, for the front desk to see against the folio. */
    roomCharge: round2(row.nights * num(row.nightlyRate)),
  }));
}

export type StayRow = Awaited<ReturnType<typeof listStays>>[number];

export async function getStay(stayId: string, branchId: string) {
  const row = await db.stay.findFirst({
    where: { id: stayId, branchId },
    include: { room: { select: { name: true, variantId: true } }, folio: { select: { id: true, number: true, grandTotal: true, status: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    guestName: row.guestName,
    roomName: row.room.name,
    nightItemId: row.room.variantId,
    customerId: row.customerId,
    status: row.status,
    nights: row.nights,
    nightlyRate: num(row.nightlyRate),
    folioId: row.folio?.id ?? null,
    folioTotal: row.folio ? num(row.folio.grandTotal) : 0,
  };
}

export type StayForTill = NonNullable<Awaited<ReturnType<typeof getStay>>>;

// --- Rentals ------------------------------------------------------------------

export async function listRentals(branchId: string, options?: { openOnly?: boolean }) {
  // Anything past its due date reads as overdue, swept before the list is built.
  await refreshRentalStatuses();

  const rows = await db.rental.findMany({
    where: { branchId, ...(options?.openOnly ? { status: { in: ["OUT", "OVERDUE"] } } : {}) },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 200,
    include: { customer: { select: { id: true, name: true } }, sale: { select: { number: true } }, settledSale: { select: { number: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    customerId: row.customer?.id ?? null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    itemName: row.itemName,
    variantId: row.variantId,
    quantity: num(row.quantity),
    dailyRate: num(row.dailyRate),
    deposit: num(row.deposit),
    outAt: row.outAt,
    dueAt: row.dueAt,
    returnedAt: row.returnedAt,
    status: row.status,
    lateFee: num(row.lateFee),
    note: row.note,
    saleNumber: row.sale?.number ?? null,
    settledSaleNumber: row.settledSale?.number ?? null,
  }));
}

export type RentalRow = Awaited<ReturnType<typeof listRentals>>[number];
