"use server";

import { BusinessError } from "@/lib/auth/errors";
import { authorize, authorizeModule } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { CSV_ROW_LIMIT, csvFilename, toCsv, type CsvColumn } from "@/lib/export/csv";
import { getCurrentBranch } from "@/lib/data/platform";
import { listCustomers, listSuppliers } from "@/lib/data/parties";
import { listSales } from "@/lib/data/pos";
import { listPurchases } from "@/lib/data/procurement";
import { listInvoices, listQuotations, today } from "@/lib/data/sales";
import { listStock } from "@/lib/data/items";
import { parseListParams, type ListParams } from "@/lib/list-params";
import { INVOICE_STATUS, QUOTATION_STATUS } from "@/lib/business/sales-status";
import { PURCHASE_STATUS } from "@/lib/business/procurement-status";

/**
 * Exporting a list to CSV.
 *
 * Each export answers the question the screen is currently asking — the same search and filter —
 * but across **every** page rather than the twenty-five on display, because "export" that gave you
 * one page would be a trap. The filters arrive as the URL's own query string, so the file matches
 * what the person was looking at when they clicked.
 *
 * Every action authorises exactly what its page requires. An export is a bulk read of the same
 * data, so it is never a weaker check than opening the screen.
 */

export type CsvExport = { filename: string; csv: string; rows: number };

/** The filters, widened to fetch the whole filtered list instead of one page. */
function exportParams(search: Record<string, string | string[] | undefined>, defaultFilter?: string): ListParams {
  const params = parseListParams(search, defaultFilter);
  return { ...params, page: 1, pageSize: CSV_ROW_LIMIT + 1 };
}

/**
 * Refuses rather than truncates.
 *
 * A short file that looks complete is the worst possible outcome of an export, so an over-large one
 * is turned down with the one instruction that fixes it.
 */
function assertExportable(total: number, subject: string) {
  if (total > CSV_ROW_LIMIT) {
    throw new BusinessError(
      `${total.toLocaleString("en-US")} ${subject} is more than one file can carry (${CSV_ROW_LIMIT.toLocaleString("en-US")}). Narrow the search or the filter and try again.`,
    );
  }
}

async function build<T>(subject: string, columns: CsvColumn<T>[], rows: T[], total: number): Promise<CsvExport> {
  assertExportable(total, subject);
  return { filename: csvFilename(subject, await today()), csv: toCsv(columns, rows), rows: rows.length };
}

// --- Sales -------------------------------------------------------------------

export async function exportInvoices(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorize("SALES", "view");
    const { items, total } = await listInvoices(exportParams(search));
    return build(
      "invoices",
      [
        { header: "Invoice", value: (r) => r.number },
        { header: "Date", value: (r) => r.date },
        { header: "Due date", value: (r) => r.dueDate },
        { header: "Customer", value: (r) => r.customer.name },
        { header: "Customer email", value: (r) => r.customer.email },
        { header: "Status", value: (r) => INVOICE_STATUS[r.status].label },
        { header: "Total", value: (r) => r.grandTotal },
        { header: "Paid", value: (r) => r.paidTotal },
        { header: "Credited", value: (r) => r.creditedTotal },
        { header: "Outstanding", value: (r) => r.remaining },
      ],
      items,
      total,
    );
  });
}

export async function exportQuotations(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorize("SALES", "view");
    const { items, total } = await listQuotations(exportParams(search));
    return build(
      "quotations",
      [
        { header: "Quotation", value: (r) => r.number },
        { header: "Date", value: (r) => r.date },
        { header: "Valid until", value: (r) => r.validUntil },
        { header: "Customer", value: (r) => r.customer.name },
        { header: "Status", value: (r) => QUOTATION_STATUS[r.status].label },
        { header: "Total", value: (r) => r.grandTotal },
      ],
      items,
      total,
    );
  });
}

// --- Procurement -------------------------------------------------------------

export async function exportPurchases(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "view");
    const { items, total } = await listPurchases(exportParams(search));
    return build(
      "purchases",
      [
        { header: "Purchase", value: (r) => r.number },
        { header: "Supplier reference", value: (r) => r.supplierReference },
        { header: "Date", value: (r) => r.date },
        { header: "Due date", value: (r) => r.dueDate },
        { header: "Supplier", value: (r) => r.supplier.name },
        { header: "Status", value: (r) => PURCHASE_STATUS[r.status].label },
        { header: "Total", value: (r) => r.grandTotal },
        { header: "Paid", value: (r) => r.paidTotal },
        { header: "Outstanding", value: (r) => r.remaining },
      ],
      items,
      total,
    );
  });
}

// --- Customers & suppliers ---------------------------------------------------

/** Both parties share a shape, so they share their columns. */
const PARTY_COLUMNS: CsvColumn<Awaited<ReturnType<typeof listCustomers>>["items"][number]>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Type", value: (r) => (r.type === "COMPANY" ? "Company" : "Individual") },
  { header: "Phone", value: (r) => r.phone },
  { header: "Email", value: (r) => r.email },
  { header: "Active", value: (r) => r.isActive },
  { header: "Invoiced", value: (r) => r.financials.total },
  { header: "Paid", value: (r) => r.financials.paid },
  { header: "Outstanding", value: (r) => r.financials.outstanding },
];

export async function exportCustomers(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorize("CUSTOMERS", "view");
    const { items, total } = await listCustomers(exportParams(search));
    return build("customers", PARTY_COLUMNS, items, total);
  });
}

export async function exportSuppliers(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "view");
    const { items, total } = await listSuppliers(exportParams(search));
    // A supplier's figures are what the company owes, not what it is owed.
    return build(
      "suppliers",
      PARTY_COLUMNS.map((column) => (column.header === "Invoiced" ? { ...column, header: "Purchased" } : column)),
      items,
      total,
    );
  });
}

// --- POS ---------------------------------------------------------------------

export async function exportPosSales(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorizeModule("POS", "POS", "view");
    const branch = await getCurrentBranch();
    const { sales, total } = await listSales(exportParams(search), branch.id);
    return build(
      "pos-sales",
      [
        { header: "Receipt", value: (r) => r.number },
        { header: "Sold at", value: (r) => r.soldAt },
        { header: "Branch", value: (r) => r.branchName },
        { header: "Register", value: (r) => r.registerName },
        { header: "Cashier", value: (r) => r.cashierName },
        { header: "Customer", value: (r) => r.customerName },
        { header: "Status", value: (r) => r.status },
        { header: "Lines", value: (r) => r.itemCount },
        { header: "Total", value: (r) => r.total },
        { header: "Paid", value: (r) => r.paid },
      ],
      sales,
      total,
    );
  });
}

export async function exportStock(search: Record<string, string | string[] | undefined>): Promise<ActionResult<CsvExport>> {
  return runAction(async () => {
    await authorizeModule("POS", "INVENTORY", "view");
    const branch = await getCurrentBranch();
    // Stock is held per branch, so the file says which branch it is a count of.
    const { items, total } = await listStock(exportParams(search), branch.id);
    return build(
      `stock-${branch.name}`,
      [
        { header: "Item", value: (r) => r.itemName },
        { header: "Variant", value: (r) => r.variantName },
        { header: "SKU", value: (r) => r.sku },
        { header: "Barcode", value: (r) => r.barcode },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Unit", value: (r) => r.unit },
        { header: "On hand", value: (r) => r.quantity },
        { header: "Minimum", value: (r) => r.minStock },
        { header: "Low", value: (r) => r.isLow },
      ],
      items,
      total,
    );
  });
}
