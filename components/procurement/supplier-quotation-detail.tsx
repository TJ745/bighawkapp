"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, Eye, FileOutput, Inbox, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { DocumentView } from "@/components/documents/document-view";
import {
  convertSupplierQuotationToPurchase,
  decideSupplierQuotation,
  markSupplierQuotationReceived,
} from "@/actions/supplier-quotations";
import { SUPPLIER_QUOTATION_STATUS } from "@/lib/business/procurement-status";
import type { SupplierQuotationDetail } from "@/lib/data/procurement";

type Props = { quotation: SupplierQuotationDetail; canEdit: boolean; canCreate: boolean; showVat: boolean };

export function SupplierQuotationDetailView({ quotation: q, canEdit, canCreate, showVat }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [confirm, setConfirm] = useState<"received" | "accept" | "reject" | "convert" | null>(null);
  const [converting, setConverting] = useState(false);
  const status = SUPPLIER_QUOTATION_STATUS[q.status];
  const pdfUrl = `/api/procurement/supplier-quotations/${q.id}/pdf`;
  const decided = q.status === "ACCEPTED" || q.status === "REJECTED";
  const editable = canEdit && !decided && !q.purchase;

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
      const result = await convertSupplierQuotationToPurchase(q.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Purchase created");
      router.push(`/procurement/purchases/${result.data.purchaseId}`);
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/procurement/supplier-quotations">
              <ArrowLeft />
              All supplier quotations
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{q.number}</h1>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            {q.purchase ? (
              <Link href={`/procurement/purchases/${q.purchase.id}`} className="text-sm text-primary hover:underline">
                Purchase {q.purchase.number}
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {q.supplier.name} · {format.money(q.grandTotal)}
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
          {editable ? (
            <Button asChild variant="outline">
              <Link href={`/procurement/supplier-quotations/${q.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : null}
          {editable && q.status === "DRAFT" ? (
            <Button onClick={() => setConfirm("received")}>
              <Inbox />
              Mark as received
            </Button>
          ) : null}
          {editable ? (
            <>
              <Button variant="outline" className="text-success" onClick={() => setConfirm("accept")}>
                <Check />
                Accept
              </Button>
              <Button variant="outline" className="text-destructive" onClick={() => setConfirm("reject")}>
                <X />
                Reject
              </Button>
            </>
          ) : null}
          {q.status === "ACCEPTED" && !q.purchase && canCreate ? (
            <Button onClick={() => setConfirm("convert")} disabled={converting}>
              {converting ? <Loader2 className="animate-spin" /> : <FileOutput />}
              Convert to Purchase
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentView
        kind="supplier-quotation"
        documentId={q.id}
        party={q.supplier}
        meta={[
          { label: "Quotation date", value: format.date(q.date) },
          { label: "Valid until", value: q.validUntil ? format.date(q.validUntil) : "—" },
          { label: "Supplier ref.", value: q.supplierReference ?? "—" },
          { label: "Received", value: q.receivedAt ? format.dateTime(q.receivedAt) : "Not yet" },
          ...(q.decidedAt ? [{ label: status.label, value: format.dateTime(q.decidedAt) }] : []),
        ]}
        items={q.items}
        totals={q}
        internalNotes={q.notes}
        attachments={q.attachments}
        canEdit={editable}
        showVat={showVat}
      />

      <ConfirmDialog
        open={confirm === "received"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Mark as received?"
        description="The supplier's offer is complete and on file."
        confirmLabel="Mark as received"
        onConfirm={() => run(() => markSupplierQuotationReceived(q.id), "Marked as received")}
      />
      <ConfirmDialog
        open={confirm === "accept"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Accept this supplier quotation?"
        description="You can then convert it to a purchase."
        confirmLabel="Accept"
        onConfirm={() => run(() => decideSupplierQuotation(q.id, "ACCEPTED"), "Quotation accepted")}
      />
      <ConfirmDialog
        open={confirm === "reject"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reject this supplier quotation?"
        description="It will be kept for your records."
        confirmLabel="Reject"
        destructive
        onConfirm={() => run(() => decideSupplierQuotation(q.id, "REJECTED"), "Quotation rejected")}
      />
      <ConfirmDialog
        open={confirm === "convert"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Convert to purchase?"
        description="A draft purchase will be created with the same supplier and items. You can review it before marking it received."
        confirmLabel="Create purchase"
        onConfirm={convert}
      />
    </div>
  );
}
