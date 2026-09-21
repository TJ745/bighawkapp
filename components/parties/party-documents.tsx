"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilePicker, formatFileSize, type PendingFile } from "@/components/shared/file-picker";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { deletePartyDocument, uploadPartyDocuments } from "@/actions/parties";
import type { PartyDocument, PartyKind } from "@/lib/data/parties";
import type { PartyDocumentCategory } from "@/lib/generated/prisma/enums";
import { documentCategoryLabel, PARTY_DOCUMENT_CATEGORIES } from "@/lib/validation/parties";

type PartyDocumentsProps = {
  kind: PartyKind;
  partyId: string;
  documents: PartyDocument[];
  canEdit: boolean;
};

export function PartyDocuments({ kind, partyId, documents, canEdit }: PartyDocumentsProps) {
  const router = useRouter();
  const format = useFormat();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<PendingFile<PartyDocumentCategory>[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<PartyDocument | undefined>();

  async function upload() {
    if (files.length === 0) {
      toast.error("Choose at least one file.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      for (const item of files) {
        formData.append("documents", item.file);
        formData.append("documentCategories", item.category);
      }
      const result = await uploadPartyDocuments(kind, partyId, formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(files.length === 1 ? "Document uploaded" : `${files.length} documents uploaded`);
      setFiles([]);
      setUploadOpen(false);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deletePartyDocument(kind, partyId, deleting.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Document deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setUploadOpen(true)}>
            <Upload />
            Upload documents
          </Button>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description="VAT and CR certificates, bank letters and other files are kept here." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">Uploaded</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <a href={doc.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                          {doc.name}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.size)}
                          <span className="sm:hidden"> · {documentCategoryLabel(doc.category)}</span>
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge tone="info">{documentCategoryLabel(doc.category)}</StatusBadge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{format.date(doc.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" aria-label="Download">
                        <a href={doc.url} download={doc.name}>
                          <Download />
                        </a>
                      </Button>
                      {canEdit ? (
                        <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setDeleting(doc)}>
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={(o) => !uploading && setUploadOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload documents</DialogTitle>
            <DialogDescription>Choose one or more files and set a category for each.</DialogDescription>
          </DialogHeader>
          <FilePicker files={files} onChange={setFiles} categories={PARTY_DOCUMENT_CATEGORIES} defaultCategory="OTHER" disabled={uploading} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={uploading || files.length === 0}>
              {uploading ? <Loader2 className="animate-spin" /> : null}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete "${deleting?.name}"?`}
        description="The file will be removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
