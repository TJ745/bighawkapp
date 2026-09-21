"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Eye, Inbox, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { DocumentView } from "@/components/documents/document-view";
import { RecordPaymentDialog, type PaymentAccountOption } from "@/components/documents/record-payment-dialog";
import { markPurchaseReceived, recordPurchasePayment } from "@/actions/purchases";
import { PURCHASE_STATUS } from "@/lib/business/procurement-status";
import type { PurchaseDetail } from "@/lib/data/procurement";

type Props = {
  purchase: PurchaseDetail;
  canEdit: boolean;
  showVat: boolean;
  accounts: PaymentAccountOption[];
  today: string;
};

export function PurchaseDetailView({ purchase: p, canEdit, showVat, accounts, today }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [payOpen, setPayOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const status = PURCHASE_STATUS[p.status];
  const pdfUrl = `/api/procurement/purchases/${p.id}/pdf`;

  async function markReceived() {
    const result = await markPurchaseReceived(p.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as received");
    router.refresh();
  }

  const extraTotals =
    p.paidTotal > 0
      ? [
          { label: "Paid", value: p.paidTotal, negative: true },
          { label: "Balance", value: p.remaining, emphasis: true },
        ]
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/procurement/purchases">
              <ArrowLeft />
              All purchases
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{p.number}</h1>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {p.supplierQuotation ? (
              <Link href={`/procurement/supplier-quotations/${p.supplierQuotation.id}`} className="text-sm text-primary hover:underline">
                From {p.supplierQuotation.number}
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {p.supplier.name} · {format.money(p.grandTotal)}
            {p.remaining > 0 && p.paidTotal > 0 ? ` · ${format.money(p.remaining)} remaining` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Eye />
              Print
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${pdfUrl}?download=1`}>
              <Download />
              Download PDF
            </a>
          </Button>
          {canEdit ? (
            <Button asChild variant="outline">
              <Link href={`/procurement/purchases/${p.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null}
          {canEdit && !p.receivedAt ? (
            <Button variant="outline" onClick={() => setReceiveOpen(true)}>
              <Inbox />
              Mark as received
            </Button>
          ) : null}
          {canEdit && p.remaining > 0 ? (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet />
              Record Payment
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentView
        kind="purchase"
        documentId={p.id}
        party={p.supplier}
        meta={[
          { label: "Purchase date", value: format.date(p.date) },
          { label: "Due date", value: format.date(p.dueDate) },
          { label: "Payment term", value: p.paymentTermDays === 0 ? "Due immediately" : `${p.paymentTermDays} days` },
          { label: "Supplier invoice", value: p.supplierReference ?? "—" },
          { label: "Received", value: p.receivedAt ? format.dateTime(p.receivedAt) : "Not yet" },
          {
            label: "For customer",
            value: p.customer ? (
              <Link href={`/customers/${p.customer.id}`} className="hover:underline">
                {p.customer.name}
              </Link>
            ) : (
              "General"
            ),
          },
          ...(p.project
            ? [
                {
                  label: "Project",
                  value: (
                    <Link href={`/projects/${p.project.id}`} className="hover:underline">
                      {p.project.code} · {p.project.name}
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
        items={p.items}
        totals={p}
        extraTotals={extraTotals}
        internalNotes={p.notes}
        attachments={p.attachments}
        canEdit={canEdit}
        showVat={showVat}
      />

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {p.payments.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Payment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Paid from</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                  <TableHead className="pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.payments.map((pay) => (
                  <TableRow key={pay.id}>
                    <TableCell className="pl-6 font-medium">{pay.number}</TableCell>
                    <TableCell>{format.date(pay.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{pay.paymentAccount.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{pay.reference ?? "—"}</TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{format.money(pay.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        documentNumber={p.number}
        remaining={p.remaining}
        today={today}
        accounts={accounts}
        direction="paid"
        record={(values) => recordPurchasePayment(p.id, values)}
      />
      <ConfirmDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        title="Mark as received?"
        description="The goods or services have been received. The purchase will count towards what you owe the supplier."
        confirmLabel="Mark as received"
        onConfirm={markReceived}
      />
    </div>
  );
}
