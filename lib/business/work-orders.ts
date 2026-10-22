import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { WorkOrderStatus } from "@/lib/generated/prisma/enums";
import { nextDocumentNumber } from "./numbering";

/**
 * Repair jobs.
 *
 * A work order is the *work*: what came in, what was found, what it will cost, who is doing it and
 * whether it has gone back. The money is an ordinary POS sale linked to the job — there is no
 * second kind of invoice in this app — so a job is never a place where a total can disagree.
 */

/**
 * The journey, and the ways out of it. A job can be taken back a step while it is still in the
 * shop (a diagnosis that turns out wrong), but once it has been handed over it is finished.
 */
const NEXT: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  RECEIVED: ["DIAGNOSING", "QUOTED", "CANCELLED"],
  DIAGNOSING: ["QUOTED", "APPROVED", "RECEIVED", "CANCELLED"],
  QUOTED: ["APPROVED", "DIAGNOSING", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "QUOTED", "CANCELLED"],
  IN_PROGRESS: ["READY", "APPROVED", "CANCELLED"],
  READY: ["DELIVERED", "IN_PROGRESS", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: ["RECEIVED"],
};

export function workOrderTransitions(status: WorkOrderStatus) {
  return NEXT[status];
}

export type CreateWorkOrderInput = {
  branchId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  itemName: string;
  serialNumber: string | null;
  faultReported: string;
  staffId: string | null;
  promisedAt: Date | null;
  note: string | null;
  user: { id: string; name: string };
};

/** Takes something in. The job number is the customer's receipt for leaving it. */
export async function createWorkOrder(input: CreateWorkOrderInput) {
  if (input.staffId) {
    const staff = await db.staffMember.findUnique({ where: { id: input.staffId }, select: { branchId: true, isActive: true, name: true } });
    if (!staff || staff.branchId !== input.branchId) throw new BusinessError("That technician is not at this branch.");
    if (!staff.isActive) throw new BusinessError(`${staff.name} is no longer working here.`);
  }

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "WORK_ORDER", new Date());
    const order = await tx.workOrder.create({
      data: {
        number,
        branchId: input.branchId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        itemName: input.itemName,
        serialNumber: input.serialNumber,
        faultReported: input.faultReported,
        staffId: input.staffId,
        promisedAt: input.promisedAt,
        note: input.note,
        createdById: input.user.id,
        createdByName: input.user.name,
      },
      select: { id: true, number: true },
    });
    return order;
  });
}

/** What the shop found and what it will cost. Quoting a figure is what makes approval mean something. */
export async function updateWorkOrderDetails(input: {
  workOrderId: string;
  branchId: string;
  diagnosis: string | null;
  estimate: number | null;
  staffId: string | null;
  promisedAt: Date | null;
  note: string | null;
}) {
  const order = await db.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, branchId: true, status: true, number: true } });
  if (!order) throw new BusinessError("That job no longer exists.");
  if (order.branchId !== input.branchId) throw new BusinessError("That job belongs to another branch.");
  if (order.status === "DELIVERED") throw new BusinessError("That job has been handed back; it cannot be changed.");

  if (input.staffId) {
    const staff = await db.staffMember.findUnique({ where: { id: input.staffId }, select: { branchId: true, isActive: true, name: true } });
    if (!staff || staff.branchId !== input.branchId) throw new BusinessError("That technician is not at this branch.");
    if (!staff.isActive) throw new BusinessError(`${staff.name} is no longer working here.`);
  }

  await db.workOrder.update({
    where: { id: order.id },
    data: { diagnosis: input.diagnosis, estimate: input.estimate, staffId: input.staffId, promisedAt: input.promisedAt, note: input.note },
  });
  return { number: order.number };
}

/** Moves a job along. Approval records when it happened; delivery needs the bill settled first. */
export async function setWorkOrderStatus(input: { workOrderId: string; status: WorkOrderStatus; branchId: string }) {
  const order = await db.workOrder.findUnique({
    where: { id: input.workOrderId },
    select: { id: true, number: true, status: true, branchId: true, estimate: true, saleId: true, customerName: true },
  });
  if (!order) throw new BusinessError("That job no longer exists.");
  if (order.branchId !== input.branchId) throw new BusinessError("That job belongs to another branch.");
  if (!NEXT[order.status].includes(input.status)) {
    throw new BusinessError(`A job that is ${label(order.status)} cannot be marked ${label(input.status)}.`);
  }
  if (input.status === "QUOTED" && order.estimate === null) {
    throw new BusinessError("Put a price on it before quoting the customer.");
  }
  if (input.status === "APPROVED" && order.estimate === null) {
    throw new BusinessError("Approving means approving a price — quote it first.");
  }
  // Nothing leaves the shop unpaid: the sale is what says it was paid for.
  if (input.status === "DELIVERED" && !order.saleId) {
    throw new BusinessError("Take the payment at the till first; the job is handed over once it is paid for.");
  }

  await db.workOrder.update({
    where: { id: order.id },
    data: {
      status: input.status,
      ...(input.status === "APPROVED" ? { approvedAt: new Date() } : {}),
      ...(input.status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
    },
  });
  return { number: order.number, customerName: order.customerName, status: input.status };
}

/** The estimate as a number, for the till to start the sale from. */
export async function workOrderEstimate(workOrderId: string) {
  const order = await db.workOrder.findUnique({ where: { id: workOrderId }, select: { estimate: true } });
  return order?.estimate === null || order?.estimate === undefined ? null : num(order.estimate);
}

function label(status: WorkOrderStatus) {
  return status.toLowerCase().replace("_", " ");
}
