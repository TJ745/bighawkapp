"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Eye, MoreHorizontal, Pencil, Plus, ShoppingCart, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusMenu, statusChoices } from "@/components/shared/status-menu";
import { useFormat } from "@/components/providers/format-provider";
import { RecordPaymentDialog, type PaymentAccountOption } from "@/components/documents/record-payment-dialog";
import { markPurchaseReceived, recordPurchasePayment } from "@/actions/purchases";
import { AUTOMATIC_PROCUREMENT_STATUS, PURCHASE_STATUS, purchaseTransitions } from "@/lib/business/procurement-status";
import type { PurchaseListItem } from "@/lib/data/procurement";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "received", label: "Received" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially-paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

type Props = {
  items: PurchaseListItem[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
  accounts: PaymentAccountOption[];
  today: string;
  embedded?: boolean;
};

export function PurchasesTable({ items, total, page, hasQuery, canCreate, canEdit, accounts, today, embedded }: Props) {
  const format = useFormat();
  const [paying, setPaying] = useState<PurchaseListItem | undefined>();

  const newButton = canCreate ? (
    <Button asChild>
      <Link href="/procurement/purchases/new">
        <Plus />
        New Purchase
      </Link>
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {!embedded ? (
        <ListToolbar filters={FILTERS} searchPlaceholder="Search by number, reference or supplier">
          {newButton}
        </ListToolbar>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={hasQuery ? "No purchases match" : "No purchases yet"}
          description={hasQuery ? "Try a different search or filter." : "Record purchases directly or convert an accepted supplier quotation."}
          action={!hasQuery && !embedded ? newButton : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase</TableHead>
                {!embedded ? <TableHead>Supplier</TableHead> : null}
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
              {items.map((p) => {
                const status = PURCHASE_STATUS[p.status];
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/procurement/purchases/${p.id}`} className="font-medium hover:underline">
                        {p.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.supplierReference ? `Ref. ${p.supplierReference}` : <span className="md:hidden">{format.date(p.date)}</span>}
                      </p>
                    </TableCell>
                    {!embedded ? (
                      <TableCell>
                        <Link href={`/procurement/suppliers/${p.supplier.id}`} className="hover:underline">
                          {p.supplier.name}
                        </Link>
                      </TableCell>
                    ) : null}
                    <TableCell className="hidden md:table-cell">{format.date(p.date)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(p.grandTotal)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{format.money(p.paidTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={p.remaining > 0 && p.status !== "DRAFT" ? "font-medium" : "text-muted-foreground"}>{format.money(p.remaining)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusMenu
                        current={status}
                        choices={canEdit ? statusChoices(purchaseTransitions(p.status), PURCHASE_STATUS) : []}
                        onSelect={() => markPurchaseReceived(p.id)}
                        note={AUTOMATIC_PROCUREMENT_STATUS}
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
                            <Link href={`/procurement/purchases/${p.id}`}>
                              <Eye />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canEdit ? (
                            <DropdownMenuItem asChild>
                              <Link href={`/procurement/purchases/${p.id}/edit`}>
                                <Pencil />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <a href={`/api/procurement/purchases/${p.id}/pdf`} target="_blank" rel="noreferrer">
                              <Eye />
                              Print
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`/api/procurement/purchases/${p.id}/pdf?download=1`}>
                              <Download />
                              Download PDF
                            </a>
                          </DropdownMenuItem>
                          {canEdit && p.remaining > 0 ? (
                            <DropdownMenuItem onSelect={() => setPaying(p)}>
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
          direction="paid"
          record={(values) => recordPurchasePayment(paying.id, values)}
        />
      ) : null}
    </div>
  );
}
