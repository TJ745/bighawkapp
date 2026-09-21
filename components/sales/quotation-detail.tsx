"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, Eye, FileOutput, Loader2, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { convertQuotationToInvoice, decideQuotation, markQuotationSent, prepareQuotationEmail, sendQuotation } from "@/actions/quotations";
import { QUOTATION_STATUS } from "@/lib/business/sales-status";
import type { QuotationDetail } from "@/lib/data/sales";
import { DocumentView } from "@/components/documents/document-view";
import { SendDialog } from "@/components/documents/send-dialog";

type Props = {
  quotation: QuotationDetail;
  canEdit: boolean;
  canCreate: boolean;
  emailConfigured: boolean;
  showVat: boolean;
};

export function QuotationDetailView({ quotation: q, canEdit, canCreate, emailConfigured, showVat }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [sendOpen, setSendOpen] = useState(false);
  const [confirm, setConfirm] = useState<"accept" | "reject" | "sent" | "convert" | null>(null);
  const [converting, setConverting] = useState(false);
  const status = QUOTATION_STATUS[q.status];
  const pdfUrl = `/api/sales/quotations/${q.id}/pdf`;
  const decided = q.status === "ACCEPTED" || q.status === "REJECTED";
  const editable = canEdit && !decided && !q.invoice;

  async function run(action: () => Promise<{ success: boolean; error?: string }>, success: string) {
    const result = await action();
    if (!result.success) {
      toast.error(result.error ?? "Something went wrong.");
      return;
    }
    toast.success(success);
    router.refresh();
  }

  async function convert() {
    setConverting(true);
    try {
      const result = await convertQuotationToInvoice(q.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Invoice created");
      router.push(`/sales/invoices/${result.data.invoiceId}`);
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/sales/quotations">
              <ArrowLeft />
              All quotations
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{q.number}</h1>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {q.invoice ? (
              <Link href={`/sales/invoices/${q.invoice.id}`} className="text-sm text-primary hover:underline">
                Invoice {q.invoice.number}
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {q.customer.name} · {format.money(q.grandTotal)}
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
          {editable ? (
            <Button asChild variant="outline">
              <Link href={`/sales/quotations/${q.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null}
          {editable ? (
            <Button onClick={() => setSendOpen(true)}>
              <Send />
              Send
            </Button>
          ) : null}
          {editable && q.status !== "SENT" ? (
            <Button variant="ghost" onClick={() => setConfirm("sent")}>
              Mark as sent
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button variant="outline" className="text-success" onClick={() => setConfirm("accept")}>
                <Check />
                Accepted
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setConfirm("reject")}>
                <X />
                Rejected
              </Button>
            </>
          ) : null}
          {q.status === "ACCEPTED" && !q.invoice && canCreate ? (
            <Button onClick={() => setConfirm("convert")} disabled={converting}>
              {converting ? <Loader2 className="animate-spin" /> : <FileOutput />}
              Convert to Invoice
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentView
        kind="quotation"
        documentId={q.id}
        party={q.customer}
        meta={[
          { label: "Quotation date", value: format.date(q.date) },
          { label: "Valid until", value: q.validUntil ? format.date(q.validUntil) : "—" },
          { label: "Sent", value: q.sentAt ? format.dateTime(q.sentAt) : "Not yet" },
          ...(q.project
            ? [
                {
                  label: "Project",
                  value: (
                    <Link href={`/projects/${q.project.id}`} className="hover:underline">
                      {q.project.code} · {q.project.name}
                    </Link>
                  ),
                },
              ]
            : []),
          ...(q.decidedAt ? [{ label: status.label, value: format.dateTime(q.decidedAt) }] : []),
        ]}
        items={q.items}
        totals={q}
        terms={q.terms}
        attachments={q.attachments}
        canEdit={editable}
        showVat={showVat}
      />

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={`Send ${q.number}`}
        attachmentName={`${q.number}.pdf`}
        prepare={() => prepareQuotationEmail(q.id)}
        send={(values) => sendQuotation(q.id, values)}
        emailConfigured={emailConfigured}
      />
      <ConfirmDialog
        open={confirm === "accept"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark quotation as accepted?"
        description="The customer agreed to this quotation. You can then convert it to an invoice."
        confirmLabel="Mark accepted"
        onConfirm={() => run(() => decideQuotation(q.id, "ACCEPTED"), "Quotation accepted")}
      />
      <ConfirmDialog
        open={confirm === "reject"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark quotation as rejected?"
        description="The customer declined this quotation. It will be kept for your records."
        confirmLabel="Mark rejected"
        destructive
        onConfirm={() => run(() => decideQuotation(q.id, "REJECTED"), "Quotation rejected")}
      />
      <ConfirmDialog
        open={confirm === "sent"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark as sent?"
        description="Use this when you handed over or printed the quotation instead of emailing it."
        confirmLabel="Mark as sent"
        onConfirm={() => run(() => markQuotationSent(q.id), "Marked as sent")}
      />
      <ConfirmDialog
        open={confirm === "convert"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Convert to invoice?"
        description="A draft invoice will be created with the same customer, items and terms. You can review it before sending."
        confirmLabel="Create invoice"
        onConfirm={convert}
      />
    </div>
  );
}
