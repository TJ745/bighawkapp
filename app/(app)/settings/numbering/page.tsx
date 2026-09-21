import type { Metadata } from "next";
import { NumberingForm } from "@/components/settings/numbering-form";
import { requirePermission } from "@/lib/auth/session";
import { getDocumentSequences } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Document Numbering" };

export default async function NumberingSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const sequences = await getDocumentSequences();
  return <NumberingForm sequences={sequences} canEdit={auth.can("SETTINGS", "edit")} />;
}
