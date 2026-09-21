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
import { convertSupplierQuotationToPurchase, decideSupplierQuotation, markSupplierQuotationReceived } from "@/actions/supplier-quotations";
import { SUPPLIER_QUOTATION_STATUS, supplierQuotationTransitions } from "@/lib/business/procurement-status";
import type { SupplierQuotationListItem } from "@/lib/data/procurement";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "received", label: "Received" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

type Props = {
  items: SupplierQuotationListItem[];
  total: number;
  page: number;
  hasQuery: boolean;
  canCreate: boolean;
  canEdit: boolean;
  embedded?: boolean;
};

export function SupplierQuotationsTable({ items, total, page, hasQuery, canCreate, canEdit, embedded }: Props) {
  const router = useRouter();
  const format = useFormat();

  function changeStatus(id: string, value: string) {
    return value === "RECEIVED" ? markSupplierQuotationReceived(id) : decideSupplierQuotation(id, value as "ACCEPTED" | "REJECTED");
  }

  async function convert(id: string) {
    const result = await convertSupplierQuotationToPurchase(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Purchase created");
    router.push(`/procurement/purchases/${result.data.purchaseId}`);
  }

  const newButton = canCreate ? (
    <Button asChild>
      <Link href="/procurement/supplier-quotations/new">
        <Plus />
        New Supplier Quotation
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
          icon={FileText}
          title={hasQuery ? "No supplier quotations match" : "No supplier quotations yet"}
          description={hasQuery ? "Try a different search or filter." : "Record price offers you receive from suppliers, then accept and convert them to purchases."}
          action={!hasQuery && !embedded ? newButton : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Quotation</TableHead>
                {!embedded ? <TableHead>Supplier</TableHead> : null}
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
                const status = SUPPLIER_QUOTATION_STATUS[q.status];
                const editable = canEdit && q.status !== "ACCEPTED" && q.status !== "REJECTED" && !q.purchase;
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <Link href={`/procurement/supplier-quotations/${q.id}`} className="font-medium hover:underline">
                        {q.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">{q.supplierReference ? `Ref. ${q.supplierReference}` : null}</p>
                    </TableCell>
                    {!embedded ? (
                      <TableCell>
                        <Link href={`/procurement/suppliers/${q.supplier.id}`} className="hover:underline">
                          {q.supplier.name}
                        </Link>
                      </TableCell>
                    ) : null}
                    <TableCell className="hidden md:table-cell">{format.date(q.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{q.validUntil ? format.date(q.validUntil) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{format.money(q.grandTotal)}</TableCell>
                    <TableCell>
                      <StatusMenu
                        current={status}
                        choices={canEdit ? statusChoices(supplierQuotationTransitions(q.status, Boolean(q.purchase)), SUPPLIER_QUOTATION_STATUS) : []}
                        onSelect={(value) => changeStatus(q.id, value)}
                        note={
                          q.purchase
                            ? "Converted to a purchase, so the status is final."
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
                            <Link href={`/procurement/supplier-quotations/${q.id}`}>
                              <Eye />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {editable ? (
                            <DropdownMenuItem asChild>
                              <Link href={`/procurement/supplier-quotations/${q.id}/edit`}>
                                <Pencil />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <a href={`/api/procurement/supplier-quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">
                              <Eye />
                              Print
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`/api/procurement/supplier-quotations/${q.id}/pdf?download=1`}>
                              <Download />
                              Download PDF
                            </a>
                          </DropdownMenuItem>
                          {q.status === "ACCEPTED" && !q.purchase && canCreate ? (
                            <DropdownMenuItem onSelect={() => convert(q.id)}>
                              <FileOutput />
                              Convert to Purchase
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
