import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { addDays, parseDateOnly } from "@/lib/dates";
import { refreshProcurementStatuses } from "@/lib/data/procurement";
import { refreshSalesStatuses, today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { getFormatters } from "@/lib/settings/formatters";
import { notify } from "./notify";

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Time-based notifications (overdue invoices, invoices due soon, supplier payments due).
 * There is no background job; the app layout triggers this after a response at most every 15 minutes.
 */
export async function runNotificationSweep(force = false) {
  const settings = await getAppSettings();
  if (!force && settings.lastNotificationSweepAt && Date.now() - settings.lastNotificationSweepAt.getTime() < SWEEP_INTERVAL_MS) return;
  // Claim the sweep first so concurrent requests don't run it twice.
  const claimed = await db.appSettings.updateMany({
    where: { id: "default", ...(force ? {} : { OR: [{ lastNotificationSweepAt: null }, { lastNotificationSweepAt: { lt: new Date(Date.now() - SWEEP_INTERVAL_MS) } }] }) },
    data: { lastNotificationSweepAt: new Date() },
  });
  if (claimed.count === 0) return;

  await refreshSalesStatuses();
  await refreshProcurementStatuses();
  const f = await getFormatters();
  const todayDate = await today();

  const overdue = await db.invoice.findMany({
    where: { status: "OVERDUE" },
    select: { id: true, number: true, dueDate: true, grandTotal: true, paidTotal: true, customer: { select: { name: true } } },
  });
  for (const inv of overdue) {
    const remaining = num(inv.grandTotal) - num(inv.paidTotal);
    await notify({
      type: "INVOICE_OVERDUE",
      title: `Invoice ${inv.number} is overdue`,
      message: `${inv.customer.name} still owes ${f.money(remaining)} on ${inv.number}, which was due on ${f.date(inv.dueDate)}.`,
      link: `/sales/invoices/${inv.id}`,
      dedupeKey: `invoice-overdue:${inv.id}`,
    });
  }

  const soonLimit = parseDateOnly(addDays(todayDate, settings.invoiceDueSoonDays));
  const dueSoon = await db.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { gte: parseDateOnly(todayDate), lte: soonLimit } },
    select: { id: true, number: true, dueDate: true, grandTotal: true, paidTotal: true, customer: { select: { name: true } } },
  });
  for (const inv of dueSoon) {
    const remaining = num(inv.grandTotal) - num(inv.paidTotal);
    await notify({
      type: "INVOICE_DUE_SOON",
      title: `Invoice ${inv.number} is due on ${f.date(inv.dueDate)}`,
      message: `${f.money(remaining)} from ${inv.customer.name} is due soon.`,
      link: `/sales/invoices/${inv.id}`,
      dedupeKey: `invoice-due-soon:${inv.id}:${inv.dueDate.toISOString().slice(0, 10)}`,
    });
  }

  const supplierDue = await db.purchase.findMany({
    where: {
      OR: [{ status: "OVERDUE" }, { status: { in: ["RECEIVED", "UNPAID", "PARTIALLY_PAID"] }, dueDate: { gte: parseDateOnly(todayDate), lte: soonLimit } }],
    },
    select: { id: true, number: true, dueDate: true, status: true, grandTotal: true, paidTotal: true, supplier: { select: { name: true } } },
  });
  for (const p of supplierDue) {
    const remaining = num(p.grandTotal) - num(p.paidTotal);
    const late = p.status === "OVERDUE";
    await notify({
      type: "SUPPLIER_PAYMENT_DUE",
      title: late ? `Payment to ${p.supplier.name} is overdue` : `Payment to ${p.supplier.name} due on ${f.date(p.dueDate)}`,
      message: `${f.money(remaining)} remaining on ${p.number}${late ? ` (was due ${f.date(p.dueDate)})` : ""}.`,
      link: `/procurement/purchases/${p.id}`,
      dedupeKey: `purchase-due:${p.id}:${late ? "overdue" : p.dueDate.toISOString().slice(0, 10)}`,
    });
  }
}
