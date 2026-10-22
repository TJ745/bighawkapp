"use client";

import Link from "next/link";
import { FileMinus2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { CreditNoteRow } from "@/lib/data/credit-notes";
import { CREDIT_NOTE_STATUS } from "@/lib/validation/credit-notes";

type Props = {
  notes: CreditNoteRow[];
  total: number;
  page: number;
  searching: boolean;
};

/** Credit notes issued against invoices. Issuing one happens on the invoice it reverses. */
export function CreditNotesTable({ notes, total, page, searching }: Props) {
  const format = useFormat();

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={FileMinus2}
        title={searching ? "No credit notes match" : "No credit notes yet"}
        description={
          searching
            ? "Try a different search or filter."
            : "A credit note reverses part or all of an issued invoice. Open the invoice and choose Credit note."
        }
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Note</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden sm:table-cell">Against</TableHead>
              <TableHead className="hidden md:table-cell">Reason</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Refunded</TableHead>
              <TableHead className="text-right">Credited</TableHead>
              <TableHead className="pr-6">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes.map((note) => (
              <TableRow key={note.id}>
                <TableCell className="pl-6 font-medium">
                  <Link href={`/sales/credit-notes/${note.id}`} className="hover:underline">
                    {note.number}
                  </Link>
                </TableCell>
                <TableCell>{format.date(note.date)}</TableCell>
                <TableCell>
                  <Link href={`/customers/${note.customerId}`} className="hover:underline">
                    {note.customerName}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Link href={`/sales/invoices/${note.invoiceId}`} className="text-muted-foreground hover:underline">
                    {note.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell className="hidden max-w-56 truncate text-muted-foreground md:table-cell">{note.reason}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {note.refundedTotal > 0 ? format.money(note.refundedTotal) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {note.status === "CANCELLED" ? <span className="text-muted-foreground">—</span> : format.money(note.grandTotal)}
                </TableCell>
                <TableCell className="pr-6">
                  <StatusBadge tone={CREDIT_NOTE_STATUS[note.status].tone}>{CREDIT_NOTE_STATUS[note.status].label}</StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination total={total} page={page} />
      </CardContent>
    </Card>
  );
}
