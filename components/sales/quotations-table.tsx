"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, FileOutput, FileText, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { Pagination } from "@/components/shared/pagination";
import { StatusMenu, statusChoices } from "@/components/shared/status-menu";
import { useFormat } from "@/components/providers/format-provider";
import { convertQuotationToInvoice, decideQuotation, markQuotationSent } from "@/actions/quotations";
import { QUOTATION_STATUS, quotationTransitions } from "@/lib/business/sales-status";
import type { QuotationListItem } from "@/lib/data/sales";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

type Props = {
  items: QuotationListItem[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
  // Embedded mode (customer profile): no toolbar/new button, no customer column.
  embedded?: boolean;
};

export function QuotationsTable({ items, total, page, hasQuery, canCreate, canEdit, embedded }: Props) {
  const router = useRouter();
  const format = useFormat();

  // The same transitions the detail page offers, and the same ones the actions allow.
  function changeStatus(id: string, value: string) {
    return value === "SENT" ? markQuotationSent(id) : decideQuotation(id, value as "ACCEPTED" | "REJECTED");
  }

  async function convert(id: string) {
    const result = await convertQuotationToInvoice(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Invoice created");
    router.push(`/sales/invoices/${result.data.invoiceId}`);
  }

  const newButton = canCreate ? (
    <Button asChild>
      <Link href="/sales/quotations/new">
        <Plus />
        New Quotation
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
          icon={FileText}
          title={hasQuery ? "No quotations match" : "No quotations yet"}
          description={hasQuery ? "Try a different search or filter." : "Create a quotation to send a price offer to a customer."}
          action={!hasQuery && !embedded ? newButton : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quotation</TableHead>
                {!embedded ? <TableHead>Customer</TableHead> : null}
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="hidden lg:table-cell">Valid until</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((q) => {
                const status = QUOTATION_STATUS[q.status];
                const editable = canEdit && q.status !== "ACCEPTED" && q.status !== "REJECTED" && !q.invoice;
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link href={`/sales/quotations/${q.id}`} className="font-medium hover:underline">
                        {q.number}
                      </Link>
                      <p className="text-xs text-muted-foreground md:hidden">{format.date(q.date)}</p>
                    </TableCell>
                    {!embedded ? (
                      <TableCell>
                        <Link href={`/customers/${q.customer.id}`} className="hover:underline">
                          {q.customer.name}
                        </Link>
                      </TableCell>
                    ) : null}
                    <TableCell className="hidden md:table-cell">{format.date(q.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{q.validUntil ? format.date(q.validUntil) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(q.grandTotal)}</TableCell>
                    <TableCell>
                      <StatusMenu
                        current={status}
                        choices={canEdit ? statusChoices(quotationTransitions(q.status, Boolean(q.invoice)), QUOTATION_STATUS) : []}
                        onSelect={(value) => changeStatus(q.id, value)}
                        note={
                          q.invoice
                            ? "Converted to an invoice, so the status is final."
                            : q.status === "ACCEPTED" || q.status === "REJECTED"
                              ? "A decided quotation cannot change."
                              : "Expired is set automatically from the validity date."
                        }
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
                            <Link href={`/sales/quotations/${q.id}`}>
                              <Eye />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {editable ? (
                            <DropdownMenuItem asChild>
                              <Link href={`/sales/quotations/${q.id}/edit`}>
                                <Pencil />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <a href={`/api/sales/quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">
                              <Eye />
                              Preview / Print
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`/api/sales/quotations/${q.id}/pdf?download=1`}>
                              <Download />
                              Download PDF
                            </a>
                          </DropdownMenuItem>
                          {q.status === "ACCEPTED" && !q.invoice && canCreate ? (
                            <DropdownMenuItem onSelect={() => convert(q.id)}>
                              <FileOutput />
                              Convert to Invoice
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
    </div>
  );
}
