"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Eye, MoreHorizontal, Pencil, Plus, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusMenu, statusChoices } from "@/components/shared/status-menu";
import { useFormat } from "@/components/providers/format-provider";
import { markInvoiceSent, recordInvoicePayment } from "@/actions/invoices";
import { AUTOMATIC_SALES_STATUS, INVOICE_STATUS, invoiceTransitions } from "@/lib/business/sales-status";
import type { InvoiceListItem } from "@/lib/data/sales";
import { RecordPaymentDialog, type PaymentAccountOption } from "@/components/documents/record-payment-dialog";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially-paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

type Props = {
  items: InvoiceListItem[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
  accounts: PaymentAccountOption[];
  today: string;
  embedded?: boolean;
};

export function InvoicesTable({ items, total, page, hasQuery, canCreate, canEdit, accounts, today, embedded }: Props) {
  const format = useFormat();
  const [paying, setPaying] = useState<InvoiceListItem | undefined>();

  const newButton = canCreate ? (
    <Button asChild>
      <Link href="/sales/invoices/new">
        <Plus />
        New Invoice
      </Link>
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {!embedded ? (
        <ListToolbar filters={FILTERS} searchPlaceholder="Search by number or customer">
          {newButton}
        </ListToolbar>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasQuery ? "No invoices match" : "No invoices yet"}
          description={hasQuery ? "Try a different search or filter." : "Create an invoice directly or convert an accepted quotation."}
          action={!hasQuery && !embedded ? newButton : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                {!embedded ? <TableHead>Customer</TableHead> : null}
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((inv) => {
                const status = INVOICE_STATUS[inv.status];
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link href={`/sales/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.number}
                      </Link>
                      <p className="text-xs text-muted-foreground md:hidden">{format.date(inv.date)}</p>
                    </TableCell>
                    {!embedded ? (
                      <TableCell>
                        <Link href={`/customers/${inv.customer.id}`} className="hover:underline">
                          {inv.customer.name}
                        </Link>
                      </TableCell>
                    ) : null}
                    <TableCell className="hidden md:table-cell">{format.date(inv.date)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(inv.grandTotal)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{format.money(inv.paidTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={inv.remaining > 0 && inv.status !== "DRAFT" ? "font-medium" : "text-muted-foreground"}>{format.money(inv.remaining)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusMenu
                        current={status}
                        choices={canEdit ? statusChoices(invoiceTransitions(inv.status), INVOICE_STATUS) : []}
                        onSelect={() => markInvoiceSent(inv.id)}
                        note={AUTOMATIC_SALES_STATUS}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/sales/invoices/${inv.id}`}>
                              <Eye />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit ? (
                            <DropdownMenuItem asChild>
                              <Link href={`/sales/invoices/${inv.id}/edit`}>
                                <Pencil />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <a href={`/api/sales/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                              <Eye />
                              Preview / Print
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`/api/sales/invoices/${inv.id}/pdf?download=1`}>
                              <Download />
                              Download PDF
                            </a>
                          </DropdownMenuItem>
                          {canEdit && inv.remaining > 0 ? (
                            <DropdownMenuItem onSelect={() => setPaying(inv)}>
                              <Wallet />
                              Record Payment
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {!embedded ? <Pagination page={page} total={total} /> : null}

      {paying ? (
        <RecordPaymentDialog
          open
          onOpenChange={(o) => !o && setPaying(undefined)}
          documentNumber={paying.number}
          remaining={paying.remaining}
          today={today}
          accounts={accounts}
          direction="received"
          record={(values) => recordInvoicePayment(paying.id, values)}
        />
      ) : null}
    </div>
  );
}
