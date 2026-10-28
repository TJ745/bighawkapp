"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizePosCapability } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { createAppointment, setAppointmentStatus } from "@/lib/business/appointments";
import { getCurrentBranch } from "@/lib/data/platform";
import { getAppSettings } from "@/lib/data/settings";
import { today } from "@/lib/data/sales";
import { createSale, getOpenShift } from "@/lib/business/pos";

import { recordAudit } from "@/lib/platform/audit";
import { appointmentSchema, appointmentStatusSchema, payAppointmentSchema, staffSchema } from "@/lib/validation/staff";

/**
 * Staff, commission and bookings.
 *
 * Staff records are `INVENTORY` work (shop setup, like registers and tables); taking and moving
 * bookings is `POS`, because that is the front desk's job.
 */

function revalidateStaff() {
  revalidatePath("/pos/staff");
  revalidatePath("/pos/appointments");
  revalidatePath("/pos/register");
}

// --- The people ---------------------------------------------------------------

export async function createStaff(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("STAFF_COMMISSION", "INVENTORY", "create");
    const data = parseInput(staffSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();

    const clash = await db.staffMember.findFirst({ where: { branchId: branch.id, name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("Someone with this name is already on the team at this branch.");
    if (data.userId) {
      const taken = await db.staffMember.findUnique({ where: { userId: data.userId }, select: { id: true } });
      if (taken) throw new BusinessError("That app user is already linked to another staff member.");
    }

    const staff = await db.staffMember.create({ data: { ...data, branchId: branch.id } });
    await recordAudit({
      auth,
      action: "pos.staff_created",
      entity: "StaffMember",
      entityId: staff.id,
      branchId: branch.id,
      summary: `${staff.name} added at ${data.commissionPercent}% commission`,
    });
    revalidateStaff();
    return { id: staff.id };
  });
}

export async function updateStaff(staffId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("STAFF_COMMISSION", "INVENTORY", "edit");
    const data = parseInput(staffSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();

    const staff = await db.staffMember.findUnique({ where: { id: staffId }, select: { id: true, branchId: true, name: true } });
    if (!staff || staff.branchId !== branch.id) throw new BusinessError("That staff member is not at this branch.");
    const clash = await db.staffMember.findFirst({ where: { branchId: branch.id, name: data.name, id: { not: staffId } }, select: { id: true } });
    if (clash) throw new BusinessError("Someone with this name is already on the team at this branch.");
    if (data.userId) {
      const taken = await db.staffMember.findFirst({ where: { userId: data.userId, id: { not: staffId } }, select: { id: true } });
      if (taken) throw new BusinessError("That app user is already linked to another staff member.");
    }
    if (!data.isActive) {
      // Someone with work still in the diary cannot simply disappear from it.
      const booked = await db.appointment.findFirst({
        where: { staffId, status: { in: ["BOOKED", "CONFIRMED", "ARRIVED"] } },
        select: { customerName: true },
      });
      if (booked) throw new BusinessError(`${staff.name} still has ${booked.customerName} booked. Move or cancel the booking first.`);
    }

    await db.staffMember.update({ where: { id: staffId }, data });
    await recordAudit({
      auth,
      action: "pos.staff_updated",
      entity: "StaffMember",
      entityId: staffId,
      branchId: branch.id,
      summary: `${data.name} updated — ${data.commissionPercent}% commission${data.isActive ? "" : ", no longer working here"}`,
    });
    revalidateStaff();
  });
}

// --- The diary ----------------------------------------------------------------

/** Books a service. Times and prices come from the catalogue; clashes are refused. */
export async function bookAppointment(input: unknown): Promise<ActionResult<{ id: string; startAt: string; minutes: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("APPOINTMENTS", "POS_BOOKINGS", "create");
    const data = parseInput(appointmentSchema, input);
    const branch = await getCurrentBranch();

    /**
     * The form sends the date and time the shop sees. They are stored as the same wall-clock time,
     * which is what a diary means: a 2pm booking is at 2pm on the salon's clock, and every screen
     * reads it back through the regional settings.
     */
    const startAt = new Date(`${data.date}T${data.time}:00.000Z`);
    if (Number.isNaN(startAt.getTime())) throw new BusinessError("That is not a valid date and time.");

    const result = await createAppointment({
      branchId: branch.id,
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      staffId: data.staffId,
      startAt,
      note: data.note,
      items: data.items,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "pos.appointment_booked",
      entity: "Appointment",
      entityId: result.id,
      branchId: branch.id,
      summary: `${data.customerName} booked with ${result.staffName} for ${data.date} ${data.time} (${result.minutes} min)`,
      metadata: { services: data.items.length, minutes: result.minutes },
    });
    revalidateStaff();
    return { id: result.id, startAt: result.startAt.toISOString(), minutes: result.minutes };
  });
}

/**
 * Takes the money for a booking. It is an ordinary POS sale — there is no second way to take
 * money in this app — and recording it closes the booking in the same breath. The cashier may add
 * anything else the customer buys on the way out; the services are re-priced server-side either way.
 */
export async function payAppointment(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string; changeDue: number; grandTotal: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("APPOINTMENTS", "POS_BOOKINGS", "create");
    const data = parseInput(payAppointmentSchema, input);
    const [branch, settings, todayDate] = await Promise.all([getCurrentBranch(), getAppSettings(), today()]);
    if (branch.posConfig && !branch.posConfig.isActive) throw new BusinessError("POS is switched off for this branch.");
    if (data.park) throw new BusinessError("A booking is paid in full at the till, not held.");

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
      // The booking is linked inside the sale's transaction, so the two cannot come apart.
      appointmentId: data.appointmentId,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
    });

    await recordAudit({
      auth,
      action: "pos.appointment_paid",
      entity: "Appointment",
      entityId: data.appointmentId,
      branchId: branch.id,
      summary: `Booking paid as ${result.number} for ${result.totals.grandTotal}`,
      metadata: { sale: result.number, total: result.totals.grandTotal },
    });
    revalidateStaff();
    revalidatePath("/pos/sales");
    revalidatePath("/finance/income");
    return { id: result.id, number: result.number, changeDue: result.changeDue, grandTotal: result.totals.grandTotal };
  });
}

/** Moves a booking along its day: confirmed, arrived, no show, cancelled. */
export async function moveAppointment(input: unknown): Promise<ActionResult<{ customerName: string; status: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("APPOINTMENTS", "POS_BOOKINGS", "edit");
    const data = parseInput(appointmentStatusSchema, input);
    const branch = await getCurrentBranch();
    const result = await setAppointmentStatus({ appointmentId: data.appointmentId, status: data.status, branchId: branch.id });

    await recordAudit({
      auth,
      action: "pos.appointment_updated",
      entity: "Appointment",
      entityId: data.appointmentId,
      branchId: branch.id,
      summary: `${result.customerName}'s booking marked ${data.status.toLowerCase().replace("_", " ")}`,
    });
    revalidateStaff();
    return { customerName: result.customerName, status: result.status };
  });
}
