"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Eye, Pencil, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { markInvoiceSent, prepareInvoiceEmail, recordInvoicePayment, sendInvoice } from "@/actions/invoices";
import { INVOICE_STATUS } from "@/lib/business/sales-status";
import type { InvoiceDetail } from "@/lib/data/sales";
import { DocumentView } from "@/components/documents/document-view";
import { RecordPaymentDialog, type PaymentAccountOption } from "@/components/documents/record-payment-dialog";
import { SendDialog } from "@/components/documents/send-dialog";

type Props = {
  invoice: InvoiceDetail;
  canEdit: boolean;
  emailConfigured: boolean;
  showVat: boolean;
  accounts: PaymentAccountOption[];
  today: string;
};

export function InvoiceDetailView({ invoice: inv, canEdit, emailConfigured, showVat, accounts, today }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [sendOpen, setSendOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const status = INVOICE_STATUS[inv.status];
  const pdfUrl = `/api/sales/invoices/${inv.id}/pdf`;

  async function markSent() {
    const result = await markInvoiceSent(inv.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as sent");
    router.refresh();
  }

  const extraTotals = [
    ...(inv.depositAmount > 0
      ? [
          { label: `Deposit (${format.number(inv.depositPercent).replace(/[.,]00$/, "")}%)`, value: inv.depositAmount },
          { label: "Remaining after deposit", value: inv.grandTotal - inv.depositAmount },
        ]
      : []),
    ...(inv.paidTotal > 0
      ? [
          { label: "Paid", value: inv.paidTotal, negative: true },
          { label: "Balance due", value: inv.remaining, emphasis: true },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/sales/invoices">
              <ArrowLeft />
              All invoices
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{inv.number}</h1>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {inv.quotation ? (
              <Link href={`/sales/quotations/${inv.quotation.id}`} className="text-sm text-primary hover:underline">
                From {inv.quotation.number}
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {inv.customer.name} · {format.money(inv.grandTotal)}
            {inv.remaining > 0 && inv.paidTotal > 0 ? ` · ${format.money(inv.remaining)} remaining` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Eye />
              Preview / Print
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
              <Link href={`/sales/invoices/${inv.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" onClick={() => setSendOpen(true)}>
              <Send />
              Send
            </Button>
          ) : null}
          {canEdit && inv.status === "DRAFT" ? (
            <Button variant="ghost" onClick={() => setMarkOpen(true)}>
              Mark as sent
            </Button>
          ) : null}
          {canEdit && inv.remaining > 0 ? (
            <Button onClick={() => setPayOpen(true)}>
              <Wallet />
              Record Payment
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentView
        kind="invoice"
        documentId={inv.id}
        party={inv.customer}
        meta={[
          { label: "Invoice date", value: format.date(inv.date) },
          { label: "Due date", value: format.date(inv.dueDate) },
          { label: "Payment term", value: inv.paymentTermDays === 0 ? "Due immediately" : `${inv.paymentTermDays} days` },
          { label: "Sent", value: inv.sentAt ? format.dateTime(inv.sentAt) : "Not yet" },
          ...(inv.project
            ? [
                {
                  label: "Project",
                  value: (
                    <Link href={`/projects/${inv.project.id}`} className="hover:underline">
                      {inv.project.code} · {inv.project.name}
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
        items={inv.items}
        totals={inv}
        extraTotals={extraTotals}
        terms={inv.terms}
        internalNotes={inv.internalNotes}
        attachments={inv.attachments}
        canEdit={canEdit}
        showVat={showVat}
      />

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {inv.payments.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Payment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Account</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                  <TableHead className="pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6 font-medium">{p.number}</TableCell>
                    <TableCell>{format.date(p.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{p.paymentAccount.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{p.reference ?? "—"}</TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{format.money(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={`Send ${inv.number}`}
        attachmentName={`${inv.number}.pdf`}
        prepare={() => prepareInvoiceEmail(inv.id)}
        send={(values) => sendInvoice(inv.id, values)}
        emailConfigured={emailConfigured}
      />
      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        documentNumber={inv.number}
        remaining={inv.remaining}
        today={today}
        accounts={accounts}
        direction="received"
        record={(values) => recordInvoicePayment(inv.id, values)}
      />
      <ConfirmDialog
        open={markOpen}
        onOpenChange={setMarkOpen}
        title="Mark as sent?"
        description="Use this when you handed over or printed the invoice instead of emailing it."
        confirmLabel="Mark as sent"
        onConfirm={markSent}
      />
    </div>
  );
}
