"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizePosCapability } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { completeParkedSale, createSale, getOpenShift, updateParkedSale } from "@/lib/business/pos";
import { createStay, roomNightLine, setStayStatus } from "@/lib/business/stays";
import { takeBack, takeOut } from "@/lib/business/rentals";
import { createWorkOrder, setWorkOrderStatus, updateWorkOrderDetails } from "@/lib/business/work-orders";
import { getStay } from "@/lib/data/industries";
import { getCurrentBranch } from "@/lib/data/platform";
import { today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { recordAudit } from "@/lib/platform/audit";
import {
  chargeFolioSchema,
  checkOutSchema,
  payWorkOrderSchema,
  rentalSchema,
  returnRentalSchema,
  roomSchema,
  staySchema,
  stayStatusSchema,
  ticketEventSchema,
  workOrderDetailsSchema,
  workOrderSchema,
  workOrderStatusSchema,
} from "@/lib/validation/industries";

/**
 * The four advanced industries: repair jobs, ticketed events, rooms and rentals.
 *
 * Each action names its own capability, so a branch gets exactly the industry it runs. None of them
 * takes money: every payment is an ordinary POS sale, linked to the job, stay or rental it settles.
 */

function revalidateIndustries() {
  revalidatePath("/pos/work-orders");
  revalidatePath("/pos/events");
  revalidatePath("/pos/rooms");
  revalidatePath("/pos/rentals");
  revalidatePath("/pos/register");
  revalidatePath("/pos/sales");
  revalidatePath("/finance/income");
}

function dateOrNull(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

// --- Work orders --------------------------------------------------------------

export async function openWorkOrder(input: unknown): Promise<ActionResult<{ id: string; number: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("WORK_ORDERS", "POS", "create");
    const data = parseInput(workOrderSchema, input);
    const branch = await getCurrentBranch();

    const result = await createWorkOrder({
      branchId: branch.id,
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      itemName: data.itemName,
      serialNumber: data.serialNumber,
      faultReported: data.faultReported,
      staffId: data.staffId,
      promisedAt: dateOrNull(data.promisedDate),
      note: data.note,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "pos.work_order_opened",
      entity: "WorkOrder",
      entityId: result.id,
      branchId: branch.id,
      summary: `${result.number} taken in: ${data.itemName} for ${data.customerName}`,
    });
    revalidateIndustries();
    return result;
  });
}

export async function saveWorkOrderDetails(input: unknown): Promise<ActionResult<{ number: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("WORK_ORDERS", "POS", "edit");
    const data = parseInput(workOrderDetailsSchema, input);
    const branch = await getCurrentBranch();

    const result = await updateWorkOrderDetails({
      workOrderId: data.workOrderId,
      branchId: branch.id,
      diagnosis: data.diagnosis,
      estimate: data.estimate,
      staffId: data.staffId,
      promisedAt: dateOrNull(data.promisedDate),
      note: data.note,
    });

    await recordAudit({
      auth,
      action: "pos.work_order_updated",
      entity: "WorkOrder",
      entityId: data.workOrderId,
      branchId: branch.id,
      summary: `${result.number} updated${data.estimate === null ? "" : `, quoted ${data.estimate}`}`,
    });
    revalidateIndustries();
    return result;
  });
}

export async function moveWorkOrder(input: unknown): Promise<ActionResult<{ number: string; status: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("WORK_ORDERS", "POS", "edit");
    const data = parseInput(workOrderStatusSchema, input);
    const branch = await getCurrentBranch();
    const result = await setWorkOrderStatus({ workOrderId: data.workOrderId, status: data.status, branchId: branch.id });

    await recordAudit({
      auth,
      action: "pos.work_order_status",
      entity: "WorkOrder",
      entityId: data.workOrderId,
      branchId: branch.id,
      summary: `${result.number} (${result.customerName}) — ${data.status.toLowerCase().replace("_", " ")}`,
    });
    revalidateIndustries();
    return { number: result.number, status: result.status };
  });
}

/** Takes the money for a job: an ordinary sale that also marks the job paid, in one transaction. */
export async function payWorkOrder(input: unknown): Promise<ActionResult<{ id: string; number: string; changeDue: number; grandTotal: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("WORK_ORDERS", "POS", "create");
    const data = parseInput(payWorkOrderSchema, input);
    const [branch, settings, todayDate] = await Promise.all([getCurrentBranch(), getAppSettings(), today()]);
    if (data.park) throw new BusinessError("A job is paid in full when it is handed back, not held.");

    const shift = data.registerId ? await getOpenShift(data.registerId) : null;
    const result = await createSale({
      branchId: branch.id,
      registerId: data.registerId,
      shiftId: shift?.id ?? null,
      customerId: data.customerId,
      cartDiscountPercent: data.cartDiscountPercent,
      note: data.note,
      lines: data.lines,
      payments: data.payments,
      park: false,
      workOrderId: data.workOrderId,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
    });

    await recordAudit({
      auth,
      action: "pos.work_order_paid",
      entity: "WorkOrder",
      entityId: data.workOrderId,
      branchId: branch.id,
      summary: `Job paid as ${result.number} for ${result.totals.grandTotal}`,
    });
    revalidateIndustries();
    return { id: result.id, number: result.number, changeDue: result.changeDue, grandTotal: result.totals.grandTotal };
  });
}

// --- Ticketed events ----------------------------------------------------------

export async function createTicketEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TICKETS", "INVENTORY", "create");
    const data = parseInput(ticketEventSchema, input);
    const branch = await getCurrentBranch();

    const variant = await db.itemVariant.findUnique({ where: { id: data.variantId }, select: { id: true, item: { select: { name: true, kind: true } } } });
    if (!variant) throw new BusinessError("That ticket item no longer exists.");
    // A ticket admits someone; it is not a thing on a shelf.
    if (variant.item.kind !== "SERVICE") throw new BusinessError(`${variant.item.name} is a product. Sell tickets as a service item.`);

    const startsAt = new Date(`${data.date}T${data.time}:00.000Z`);
    const endsAt = data.endTime ? new Date(`${data.date}T${data.endTime}:00.000Z`) : null;
    if (endsAt && endsAt <= startsAt) throw new BusinessError("The event cannot end before it starts.");

    const event = await db.ticketEvent.create({
      data: {
        branchId: branch.id,
        name: data.name,
        variantId: variant.id,
        startsAt,
        endsAt,
        capacity: data.capacity,
        note: data.note,
        isActive: data.isActive,
      },
      select: { id: true },
    });

    await recordAudit({
      auth,
      action: "pos.event_created",
      entity: "TicketEvent",
      entityId: event.id,
      branchId: branch.id,
      summary: `${data.name} on ${data.date} ${data.time}, ${data.capacity} places`,
    });
    revalidateIndustries();
    return { id: event.id };
  });
}

export async function updateTicketEvent(eventId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TICKETS", "INVENTORY", "edit");
    const data = parseInput(ticketEventSchema, input);
    const branch = await getCurrentBranch();

    const event = await db.ticketEvent.findFirst({
      where: { id: eventId, branchId: branch.id },
      include: { issued: { select: { places: true, returned: true } } },
    });
    if (!event) throw new BusinessError("That event is not at this branch.");

    const sold = event.issued.reduce((sum, row) => sum + (row.places - row.returned), 0);
    // Capacity can grow freely, but it may never drop below what has already been sold.
    if (data.capacity < sold) throw new BusinessError(`${sold} place${sold === 1 ? " has" : "s have"} been sold; capacity cannot go below that.`);
    if (sold > 0 && data.variantId !== event.variantId) throw new BusinessError("Tickets have been sold for this event; the ticket item cannot change now.");

    const startsAt = new Date(`${data.date}T${data.time}:00.000Z`);
    const endsAt = data.endTime ? new Date(`${data.date}T${data.endTime}:00.000Z`) : null;
    if (endsAt && endsAt <= startsAt) throw new BusinessError("The event cannot end before it starts.");

    await db.ticketEvent.update({
      where: { id: event.id },
      data: { name: data.name, variantId: data.variantId, startsAt, endsAt, capacity: data.capacity, note: data.note, isActive: data.isActive },
    });

    await recordAudit({
      auth,
      action: "pos.event_updated",
      entity: "TicketEvent",
      entityId: event.id,
      branchId: branch.id,
      summary: `${data.name} updated — ${data.capacity} places${data.isActive ? "" : ", off sale"}`,
    });
    revalidateIndustries();
  });
}

// --- Rooms and stays ----------------------------------------------------------

export async function createRoom(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("ROOMS", "INVENTORY", "create");
    const data = parseInput(roomSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();

    const clash = await db.room.findFirst({ where: { branchId: branch.id, name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("A room with this name already exists at this branch.");

    const room = await db.room.create({ data: { ...data, branchId: branch.id } });
    await recordAudit({
      auth,
      action: "pos.room_created",
      entity: "Room",
      entityId: room.id,
      branchId: branch.id,
      summary: `Room ${room.name} added at ${data.nightlyRate} a night`,
    });
    revalidateIndustries();
    return { id: room.id };
  });
}

export async function updateRoom(roomId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("ROOMS", "INVENTORY", "edit");
    const data = parseInput(roomSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();

    const room = await db.room.findUnique({ where: { id: roomId }, select: { id: true, branchId: true, name: true } });
    if (!room || room.branchId !== branch.id) throw new BusinessError("That room is not at this branch.");
    const clash = await db.room.findFirst({ where: { branchId: branch.id, name: data.name, id: { not: roomId } }, select: { id: true } });
    if (clash) throw new BusinessError("A room with this name already exists at this branch.");
    if (!data.isActive) {
      const booked = await db.stay.findFirst({ where: { roomId, status: { in: ["BOOKED", "CHECKED_IN"] } }, select: { guestName: true, number: true } });
      if (booked) throw new BusinessError(`${booked.guestName} (${booked.number}) still has this room. Move or cancel the stay first.`);
    }

    await db.room.update({ where: { id: roomId }, data });
    await recordAudit({ auth, action: "pos.room_updated", entity: "Room", entityId: roomId, branchId: branch.id, summary: `Room ${data.name} updated` });
    revalidateIndustries();
  });
}

export async function bookStay(input: unknown): Promise<ActionResult<{ id: string; number: string; nights: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("ROOMS", "POS", "create");
    const data = parseInput(staySchema, input);
    const branch = await getCurrentBranch();

    const result = await createStay({
      branchId: branch.id,
      roomId: data.roomId,
      customerId: data.customerId,
      guestName: data.guestName,
      guestPhone: data.guestPhone,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      guests: data.guests,
      nightlyRate: data.nightlyRate,
      note: data.note,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "pos.stay_booked",
      entity: "Stay",
      entityId: result.id,
      branchId: branch.id,
      summary: `${result.number}: ${data.guestName} in ${result.roomName}, ${result.nights} night${result.nights === 1 ? "" : "s"}`,
    });
    revalidateIndustries();
    return { id: result.id, number: result.number, nights: result.nights };
  });
}

export async function moveStay(input: unknown): Promise<ActionResult<{ number: string; status: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("ROOMS", "POS", "edit");
    const data = parseInput(stayStatusSchema, input);
    const branch = await getCurrentBranch();
    const result = await setStayStatus({ stayId: data.stayId, status: data.status, branchId: branch.id });

    await recordAudit({
      auth,
      action: "pos.stay_status",
      entity: "Stay",
      entityId: data.stayId,
      branchId: branch.id,
      summary: `${result.number} (${result.guestName}) — ${data.status.toLowerCase().replace("_", " ")}`,
    });
    revalidateIndustries();
    return { number: result.number, status: result.status };
  });
}

/**
 * Puts charges on a room's folio. The folio is a held POS sale, so the charges are priced from the
 * catalogue and settled at check-out exactly like a table bill.
 */
export async function chargeToFolio(input: unknown): Promise<ActionResult<{ folioNumber: string; total: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("ROOMS", "POS", "create");
    const data = parseInput(chargeFolioSchema, input);
    const [branch, settings, todayDate] = await Promise.all([getCurrentBranch(), getAppSettings(), today()]);

    const stay = await getStay(data.stayId, branch.id);
    if (!stay) throw new BusinessError("That stay is not at this branch.");
    if (stay.status === "CHECKED_OUT" || stay.status === "CANCELLED" || stay.status === "NO_SHOW") {
      throw new BusinessError("That stay is closed; nothing more can be charged to it.");
    }

    // The room's own nights, where the room has an item to charge them with.
    const nights = data.includeNights ? await roomNightLine(data.stayId) : null;
    if (data.includeNights && !nights) throw new BusinessError("This room has no night item set, so the nights cannot be charged automatically.");

    const existing = stay.folioId
      ? await db.posSale.findUnique({
          where: { id: stay.folioId },
          include: { items: { orderBy: { sortOrder: "asc" }, select: { variantId: true, quantity: true, unitPrice: true, discountPercent: true } } },
        })
      : null;
    if (existing && existing.status !== "PARKED") throw new BusinessError("That folio has already been settled.");

    // A folio is replaced wholesale, like any other held bill, so what is on screen is what is on it.
    const lines = [
      ...(existing?.items
        .filter((item) => item.variantId)
        .map((item) => ({
          variantId: item.variantId!,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountPercent: Number(item.discountPercent),
        })) ?? []),
      ...(nights ? [{ variantId: nights.variantId, quantity: nights.quantity, unitPrice: nights.unitPrice }] : []),
      ...data.lines,
    ];
    if (lines.length === 0) throw new BusinessError("Add something to charge.");

    if (existing) {
      const updated = await updateParkedSale({
        saleId: existing.id,
        branchId: branch.id,
        lines,
        cartDiscountPercent: 0,
        customerId: stay.customerId,
        note: `Folio ${stay.number} · ${stay.roomName}`,
        tabName: `${stay.roomName} · ${stay.guestName}`,
        vatEnabled: settings.vatEnabled,
        defaultVatRate: settings.defaultVatRate,
      });
      await recordAudit({
        auth,
        action: "pos.folio_charged",
        entity: "Stay",
        entityId: stay.id,
        branchId: branch.id,
        summary: `${stay.number} folio now ${updated.totals.grandTotal}`,
      });
      revalidateIndustries();
      return { folioNumber: updated.number, total: updated.totals.grandTotal };
    }

    const created = await createSale({
      branchId: branch.id,
      registerId: null,
      shiftId: null,
      customerId: stay.customerId,
      tabName: `${stay.roomName} · ${stay.guestName}`,
      cartDiscountPercent: 0,
      note: `Folio ${stay.number} · ${stay.roomName}`,
      lines,
      payments: [],
      park: true,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
    });
    await db.stay.update({ where: { id: stay.id }, data: { folioId: created.id } });

    await recordAudit({
      auth,
      action: "pos.folio_opened",
      entity: "Stay",
      entityId: stay.id,
      branchId: branch.id,
      summary: `${stay.number} folio opened as ${created.number} for ${created.totals.grandTotal}`,
    });
    revalidateIndustries();
    return { folioNumber: created.number, total: created.totals.grandTotal };
  });
}

/** Settles the folio and checks the guest out. Paying is what checking out means. */
export async function checkOutStay(input: unknown): Promise<ActionResult<{ number: string; total: number; changeDue: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("ROOMS", "POS", "create");
    const data = parseInput(checkOutSchema, input);
    const [branch, todayDate] = await Promise.all([getCurrentBranch(), today()]);

    const stay = await getStay(data.stayId, branch.id);
    if (!stay) throw new BusinessError("That stay is not at this branch.");
    if (stay.status !== "CHECKED_IN" && stay.status !== "BOOKED") throw new BusinessError("That stay is not open.");
    if (!stay.folioId) throw new BusinessError("Nothing has been charged to this room yet.");

    const shift = data.registerId ? await getOpenShift(data.registerId) : null;
    const result = await completeParkedSale({
      saleId: stay.folioId,
      branchId: branch.id,
      registerId: data.registerId,
      shiftId: shift?.id ?? null,
      payments: data.payments,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
    });

    // The money is in; the stay is over.
    await db.stay.update({ where: { id: stay.id }, data: { status: "CHECKED_OUT" } });

    await recordAudit({
      auth,
      action: "pos.stay_checked_out",
      entity: "Stay",
      entityId: stay.id,
      branchId: branch.id,
      summary: `${stay.number} checked out, folio ${result.number} for ${result.totals.grandTotal}`,
    });
    revalidateIndustries();
    return { number: result.number, total: result.totals.grandTotal, changeDue: result.changeDue };
  });
}

// --- Rentals ------------------------------------------------------------------

export async function rentOut(input: unknown): Promise<ActionResult<{ id: string; number: string; dueAt: string; days: number; dailyRate: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("RENTALS", "POS", "create");
    const data = parseInput(rentalSchema, input);
    const branch = await getCurrentBranch();

    const result = await takeOut({
      branchId: branch.id,
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      variantId: data.variantId,
      quantity: data.quantity,
      days: data.days,
      dailyRate: data.dailyRate,
      deposit: data.deposit,
      note: data.note,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "pos.rental_out",
      entity: "Rental",
      entityId: result.id,
      branchId: branch.id,
      summary: `${result.number}: ${result.itemName} out to ${data.customerName} for ${data.days} day${data.days === 1 ? "" : "s"}`,
    });
    revalidateIndustries();
    return { id: result.id, number: result.number, dueAt: result.dueAt.toISOString(), days: result.days, dailyRate: result.dailyRate };
  });
}

/** Takes it back. Stock returns here; any late fee is charged at the till afterwards. */
export async function returnRental(input: unknown): Promise<ActionResult<{ number: string; daysLate: number; lateFee: number; lost: boolean }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("RENTALS", "POS", "edit");
    const data = parseInput(returnRentalSchema, input);
    const branch = await getCurrentBranch();

    const result = await takeBack({ rentalId: data.rentalId, branchId: branch.id, lost: data.lost, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: data.lost ? "pos.rental_lost" : "pos.rental_in",
      entity: "Rental",
      entityId: data.rentalId,
      branchId: branch.id,
      summary: data.lost
        ? `${result.number}: ${result.itemName} written off as lost`
        : `${result.number}: ${result.itemName} back${result.daysLate > 0 ? `, ${result.daysLate} day${result.daysLate === 1 ? "" : "s"} late (${result.lateFee})` : " on time"}`,
    });
    revalidateIndustries();
    return { number: result.number, daysLate: result.daysLate, lateFee: result.lateFee, lost: result.lost };
  });
}
