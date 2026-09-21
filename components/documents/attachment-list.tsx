"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatFileSize } from "@/components/shared/file-picker";
import { deleteInvoiceAttachment } from "@/actions/invoices";
import { deletePurchaseAttachment } from "@/actions/purchases";
import { deleteQuotationAttachment } from "@/actions/quotations";
import { deleteSupplierQuotationAttachment } from "@/actions/supplier-quotations";
import type { ActionResult } from "@/lib/actions";
import type { DocumentAttachment } from "@/lib/data/sales";
import type { DocumentKind } from "./document-kinds";

const DELETE: Record<DocumentKind, (documentId: string, attachmentId: string) => Promise<ActionResult>> = {
  quotation: deleteQuotationAttachment,
  invoice: deleteInvoiceAttachment,
  "supplier-quotation": deleteSupplierQuotationAttachment,
  purchase: deletePurchaseAttachment,
};

type AttachmentListProps = {
  kind: DocumentKind;
  documentId: string;
  attachments: DocumentAttachment[];
  canEdit: boolean;
};

export function AttachmentList({ kind, documentId, attachments, canEdit }: AttachmentListProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<DocumentAttachment | undefined>();

  async function confirmDelete() {
    if (!deleting) return;
    const result = await DELETE[kind](documentId, deleting.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Attachment removed");
    router.refresh();
  }

  if (attachments.length === 0) return <p className="text-sm text-muted-foreground">No attachments.</p>;

  return (
    <>
      <ul className="divide-y rounded-lg border">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-2 p-2.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">
              {a.name}
            </a>
            <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(a.size)}</span>
            {canEdit ? (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove attachment" onClick={() => setDeleting(a)}>
                <Trash2 />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Remove "${deleting?.name}"?`}
        description="The file will be removed from this document."
        confirmLabel="Remove"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
