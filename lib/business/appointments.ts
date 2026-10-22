import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { AppointmentStatus } from "@/lib/generated/prisma/enums";

/**
 * Bookings.
 *
 * A booking is a promise about time, so the two things that matter are that the services are
 * priced and timed from the catalogue (not from the browser) and that one person is never booked
 * twice at once. Money only appears when the booking is paid, and then it is an ordinary POS sale
 * — there is no second way to take money in this app.
 */

/** Forward through the day, with the two ways a booking can end early. */
const NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  BOOKED: ["CONFIRMED", "ARRIVED", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["ARRIVED", "NO_SHOW", "CANCELLED"],
  ARRIVED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: ["BOOKED"],
};

export function appointmentTransitions(status: AppointmentStatus) {
  return NEXT[status];
}

export type AppointmentServiceInput = { variantId: string; durationMinutes?: number; staffId?: string | null };

type ResolvedService = { variantId: string; name: string; durationMinutes: number; price: number; staffId: string | null };

/** Prices and times the booked services from the catalogue. */
export async function resolveServices(items: AppointmentServiceInput[], branchId: string): Promise<ResolvedService[]> {
  if (items.length === 0) throw new BusinessError("Add at least one service to the booking.");

  const variants = await db.itemVariant.findMany({
    where: { id: { in: items.map((item) => item.variantId) } },
    include: { item: { select: { name: true, kind: true, salePrice: true, durationMinutes: true, isActive: true } } },
  });

  const staffIds = [...new Set(items.map((item) => item.staffId).filter((id): id is string => Boolean(id)))];
  if (staffIds.length > 0) {
    const staff = await db.staffMember.findMany({ where: { id: { in: staffIds }, branchId, isActive: true }, select: { id: true } });
    if (staff.length !== staffIds.length) throw new BusinessError("One of those staff members is not available at this branch.");
  }

  return items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) throw new BusinessError("One of those services no longer exists.");
    if (!variant.isActive || !variant.item.isActive) throw new BusinessError(`${variant.item.name} is no longer offered.`);
    // A booking is time. A product takes none, so it is sold at the till, never booked.
    if (variant.item.kind !== "SERVICE") throw new BusinessError(`${variant.item.name} is a product, so it cannot be booked — sell it at the till.`);

    // A booking is time, so a service with no length set gets the default half hour rather than
    // a zero-length slot nobody can see on the calendar.
    const catalogueMinutes = variant.item.durationMinutes ?? 30;
    const minutes = item.durationMinutes ?? catalogueMinutes;
    if (minutes < 5) throw new BusinessError(`${variant.item.name} needs at least 5 minutes.`);

    return {
      variantId: variant.id,
      name: variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name,
      durationMinutes: minutes,
      price: variant.salePrice === null ? num(variant.item.salePrice) : num(variant.salePrice),
      staffId: item.staffId ?? null,
    };
  });
}

/**
 * Refuses a booking that would overlap one the same person already has. Cancelled and no-show
 * bookings do not hold time; a completed one does, because it happened.
 */
export async function assertStaffFree(input: { staffId: string; startAt: Date; endAt: Date; ignoreAppointmentId?: string }) {
  const clash = await db.appointment.findFirst({
    where: {
      staffId: input.staffId,
      id: input.ignoreAppointmentId ? { not: input.ignoreAppointmentId } : undefined,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      // Two ranges overlap when each starts before the other ends.
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
    },
    select: { id: true, startAt: true, customerName: true, staff: { select: { name: true } } },
    orderBy: { startAt: "asc" },
  });
  if (clash) {
    throw new BusinessError(`${clash.staff.name} already has ${clash.customerName} booked at that time.`);
  }
}

export type CreateAppointmentInput = {
  branchId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  staffId: string;
  startAt: Date;
  note: string | null;
  items: AppointmentServiceInput[];
  user: { id: string; name: string };
};

export async function createAppointment(input: CreateAppointmentInput) {
  const staff = await db.staffMember.findUnique({ where: { id: input.staffId }, select: { id: true, name: true, branchId: true, isActive: true } });
  if (!staff || staff.branchId !== input.branchId) throw new BusinessError("That staff member is not at this branch.");
  if (!staff.isActive) throw new BusinessError(`${staff.name} is no longer working here.`);

  const services = await resolveServices(input.items, input.branchId);
  const minutes = services.reduce((sum, service) => sum + service.durationMinutes, 0);
  const endAt = new Date(input.startAt.getTime() + minutes * 60_000);

  await assertStaffFree({ staffId: staff.id, startAt: input.startAt, endAt });
  // A second pair of hands taking one service must also be free for it.
  let offset = 0;
  for (const service of services) {
    const from = new Date(input.startAt.getTime() + offset * 60_000);
    const to = new Date(from.getTime() + service.durationMinutes * 60_000);
    if (service.staffId && service.staffId !== staff.id) {
      await assertStaffFree({ staffId: service.staffId, startAt: from, endAt: to });
    }
    offset += service.durationMinutes;
  }

  const appointment = await db.appointment.create({
    data: {
      branchId: input.branchId,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      staffId: staff.id,
      startAt: input.startAt,
      endAt,
      note: input.note,
      createdById: input.user.id,
      createdByName: input.user.name,
      items: {
        create: services.map((service, index) => ({
          variantId: service.variantId,
          name: service.name,
          durationMinutes: service.durationMinutes,
          price: service.price,
          staffId: service.staffId,
          sortOrder: index,
        })),
      },
    },
    select: { id: true, startAt: true, endAt: true },
  });

  return { id: appointment.id, startAt: appointment.startAt, endAt: appointment.endAt, minutes, staffName: staff.name };
}

export async function setAppointmentStatus(input: { appointmentId: string; status: AppointmentStatus; branchId: string }) {
  const appointment = await db.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, status: true, branchId: true, customerName: true, saleId: true },
  });
  if (!appointment) throw new BusinessError("That booking no longer exists.");
  if (appointment.branchId !== input.branchId) throw new BusinessError("That booking belongs to another branch.");
  if (!NEXT[appointment.status].includes(input.status)) {
    throw new BusinessError(`A booking that is ${appointment.status.toLowerCase().replace("_", " ")} cannot be marked ${input.status.toLowerCase().replace("_", " ")}.`);
  }
  // Only paying for it completes it, and that happens at the till.
  if (input.status === "COMPLETED" && !appointment.saleId) {
    throw new BusinessError("Take the payment at the till; the booking completes itself when the sale is recorded.");
  }

  await db.appointment.update({ where: { id: appointment.id }, data: { status: input.status } });
  return { customerName: appointment.customerName, status: input.status };
}
