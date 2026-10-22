import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditNoteDetailView } from "@/components/sales/credit-note-detail";
import { requirePermission } from "@/lib/auth/session";
import { getCreditNote } from "@/lib/data/credit-notes";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Credit note" };

export default async function CreditNotePage({ params }: PageProps<"/sales/credit-notes/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("SALES", "view");
  const [note, settings] = await Promise.all([getCreditNote(id), getAppSettings()]);
  if (!note) notFound();

  return <CreditNoteDetailView note={note} showVat={settings.vatEnabled} canCancel={auth.can("SALES", "delete")} />;
}
