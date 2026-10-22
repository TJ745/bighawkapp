"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentView } from "@/components/documents/document-view";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { withdrawCreditNote } from "@/actions/credit-notes";
import type { CreditNoteDetail } from "@/lib/data/credit-notes";
import { CREDIT_NOTE_STATUS } from "@/lib/validation/credit-notes";

type Props = {
  note: CreditNoteDetail;
  showVat: boolean;
  canCancel: boolean;
};

/** One credit note: what it reversed, what went back, and the invoice it belongs to. */
export function CreditNoteDetailView({ note, showVat, canCancel }: Props) {
  const format = useFormat();
  const [cancelOpen, setCancelOpen] = useState(false);
  const status = CREDIT_NOTE_STATUS[note.status];
  const pdfUrl = `/api/sales/credit-notes/${note.id}/pdf`;
  const onAccount = Math.max(0, note.grandTotal - note.refundedTotal);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/sales/credit-notes">
              <ArrowLeft />
              All credit notes
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{note.number}</h1>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <Link href={`/sales/invoices/${note.invoice.id}`} className="text-sm text-primary hover:underline">
              Against {note.invoice.number}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {note.customer.name} · {format.money(note.grandTotal)}
            {note.status === "CANCELLED" ? " · cancelled, so it credits nothing" : note.refundedTotal > 0 ? ` · ${format.money(note.refundedTotal)} refunded` : ""}
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
          {canCancel && note.status === "ISSUED" ? (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              <Ban />
              Cancel note
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentView
        kind="invoice"
        documentId={note.id}
        party={note.customer}
        meta={[
          { label: "Credit note date", value: format.date(note.date) },
          { label: "Against invoice", value: <Link href={`/sales/invoices/${note.invoice.id}`} className="hover:underline">{note.invoice.number}</Link> },
          { label: "Reason", value: note.reason },
          { label: "Issued by", value: note.createdByName },
          ...(note.status === "CANCELLED"
            ? [{ label: "Cancelled", value: `${note.cancelledByName ?? "—"}${note.cancelReason ? ` · ${note.cancelReason}` : ""}` }]
            : []),
        ]}
        items={note.items}
        totals={note}
        extraTotals={[
          ...(note.refundedTotal > 0 ? [{ label: "Refunded in money", value: note.refundedTotal }] : []),
          ...(onAccount > 0 ? [{ label: "Credited against the account", value: onAccount }] : []),
        ]}
        internalNotes={note.internalNotes}
        attachments={[]}
        canEdit={false}
        showVat={showVat}
      />

      <Card>
        <CardHeader>
          <CardTitle>Where the invoice stands</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Row label={`${note.invoice.number} total`} value={format.money(note.invoice.grandTotal)} />
            <Row label="Paid" value={format.money(note.invoice.paidTotal)} />
            <Row label="Credited in total" value={format.money(note.invoice.creditedTotal)} />
            <Row
              label="Still owed"
              value={format.money(Math.max(0, note.invoice.grandTotal - note.invoice.paidTotal - note.invoice.creditedTotal))}
            />
          </dl>
        </CardContent>
      </Card>

      {note.refunds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Money given back</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
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
                {note.refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="pl-6 font-medium">{refund.number}</TableCell>
                    <TableCell>{format.date(refund.date)}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{refund.accountName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{refund.reference ?? "—"}</TableCell>
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{format.money(refund.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <CancelDialog note={note} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function CancelDialog({ note, open, onOpenChange }: { note: CreditNoteDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await withdrawCreditNote({ creditNoteId: note.id, reason });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.number} cancelled — ${result.data.invoiceNumber} is owed again`);
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel {note.number}?</DialogTitle>
          <DialogDescription>
            The note stays on record — it was a tax document — but the credit goes away: {note.invoice.number} is owed again
            {note.refundedTotal > 0 ? `, and the ${note.refundedTotal} refund comes back out of the account it left` : ""}.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Why" htmlFor="cancel-credit-reason" required>
          <Input id="cancel-credit-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Cancel the note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
