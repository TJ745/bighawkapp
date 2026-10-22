import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { round2 } from "@/lib/business/totals";
import { dateWhere } from "@/lib/business/finance";
import type { DateRange } from "@/lib/validation/finance";

/** Reads for the staff list, the commission report and the booking calendar. */

export async function listStaff(branchId: string, options?: { activeOnly?: boolean }) {
  const rows = await db.staffMember.findMany({
    where: { branchId, ...(options?.activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    userId: row.userId,
    userEmail: row.user?.email ?? null,
    commissionPercent: num(row.commissionPercent),
    colour: row.colour,
    isActive: row.isActive,
  }));
}

export type StaffRow = Awaited<ReturnType<typeof listStaff>>[number];

/**
 * What each person earned over a period.
 *
 * Only money that was actually taken counts, so held bills are left out and voided ones disappear
 * with their reversal. What came back is shown separately from what was earned — never netted into
 * one number that hides a refund.
 */
export async function staffCommission(branchId: string, range: DateRange) {
  const rows = await db.posSaleItemStaff.findMany({
    where: {
      saleItem: {
        sale: {
          branchId,
          status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] },
          // The same cash-basis date filter Finance uses, so the two reports cannot disagree.
          date: dateWhere(range),
        },
      },
    },
    select: {
      staffId: true,
      staffName: true,
      commissionPercent: true,
      amount: true,
      reversedAmount: true,
      saleItem: { select: { name: true, quantity: true, lineSubtotal: true, lineDiscount: true, sale: { select: { number: true, date: true } } } },
    },
  });

  const byStaff = new Map<
    string,
    { staffId: string | null; name: string; services: number; sales: number; earned: number; reversed: number; net: number }
  >();
  for (const row of rows) {
    const key = row.staffId ?? row.staffName;
    const current = byStaff.get(key) ?? { staffId: row.staffId, name: row.staffName, services: 0, sales: 0, earned: 0, reversed: 0, net: 0 };
    current.services += 1;
    current.sales = round2(current.sales + (num(row.saleItem.lineSubtotal) - num(row.saleItem.lineDiscount)));
    current.earned = round2(current.earned + num(row.amount));
    current.reversed = round2(current.reversed + num(row.reversedAmount));
    current.net = round2(current.earned - current.reversed);
    byStaff.set(key, current);
  }

  const people = [...byStaff.values()].sort((a, b) => b.net - a.net);
  return {
    people,
    totals: {
      sales: round2(people.reduce((sum, person) => sum + person.sales, 0)),
      earned: round2(people.reduce((sum, person) => sum + person.earned, 0)),
      reversed: round2(people.reduce((sum, person) => sum + person.reversed, 0)),
      net: round2(people.reduce((sum, person) => sum + person.net, 0)),
    },
  };
}

export type CommissionReport = Awaited<ReturnType<typeof staffCommission>>;

/** A day's bookings for the calendar, in order, with what each one is for. */
export async function listAppointments(branchId: string, date: string) {
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 24 * 60 * 60_000);

  const rows = await db.appointment.findMany({
    where: { branchId, startAt: { gte: from, lt: to } },
    orderBy: { startAt: "asc" },
    include: {
      staff: { select: { id: true, name: true, colour: true } },
      customer: { select: { id: true, name: true } },
      items: { orderBy: { sortOrder: "asc" }, include: { staff: { select: { name: true } } } },
      sale: { select: { id: true, number: true, grandTotal: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    staffId: row.staff.id,
    staffName: row.staff.name,
    staffColour: row.staff.colour,
    customerId: row.customer?.id ?? null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    startAt: row.startAt,
    endAt: row.endAt,
    minutes: Math.max(5, Math.round((row.endAt.getTime() - row.startAt.getTime()) / 60_000)),
    status: row.status,
    note: row.note,
    saleId: row.sale?.id ?? null,
    saleNumber: row.sale?.number ?? null,
    expected: round2(row.items.reduce((sum, item) => sum + num(item.price), 0)),
    items: row.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      name: item.name,
      durationMinutes: item.durationMinutes,
      price: num(item.price),
      staffName: item.staff?.name ?? null,
    })),
  }));
}

export type AppointmentRow = Awaited<ReturnType<typeof listAppointments>>[number];

/** One booking, for turning it into a sale at the till. */
export async function getAppointment(appointmentId: string, branchId: string) {
  const row = await db.appointment.findFirst({
    where: { id: appointmentId, branchId },
    include: {
      staff: { select: { id: true, name: true } },
      items: { orderBy: { sortOrder: "asc" } },
      customer: { select: { id: true, name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    staffId: row.staff.id,
    staffName: row.staff.name,
    status: row.status,
    saleId: row.saleId,
    note: row.note,
    startAt: row.startAt,
    items: row.items.map((item) => ({
      variantId: item.variantId,
      name: item.name,
      price: num(item.price),
      staffId: item.staffId ?? row.staff.id,
    })),
  };
}

export type AppointmentForTill = NonNullable<Awaited<ReturnType<typeof getAppointment>>>;

/** Bookings that have arrived but not been paid for — what the till offers to ring up. */
export async function listAwaitingPayment(branchId: string) {
  const rows = await db.appointment.findMany({
    where: { branchId, saleId: null, status: { in: ["BOOKED", "CONFIRMED", "ARRIVED"] } },
    orderBy: { startAt: "asc" },
    take: 20,
    include: { staff: { select: { name: true } }, items: { select: { price: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customerName,
    staffName: row.staff.name,
    startAt: row.startAt,
    status: row.status,
    expected: round2(row.items.reduce((sum, item) => sum + num(item.price), 0)),
  }));
}

export type AwaitingRow = Awaited<ReturnType<typeof listAwaitingPayment>>[number];
