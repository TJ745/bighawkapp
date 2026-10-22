import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDetailView } from "@/components/sales/invoice-detail";
import { requirePermission } from "@/lib/auth/session";
import { getCreditableLines } from "@/lib/business/credit-notes";
import { listCreditNotesForInvoice } from "@/lib/data/credit-notes";
import { getInvoice, today } from "@/lib/data/sales";
import { getAppSettings, listPaymentAccounts } from "@/lib/data/settings";
import { isEmailConfigured } from "@/lib/email/mailer";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/sales/invoices/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("SALES", "view");
  const [invoice, settings, accounts, todayDate, creditable, creditNotes] = await Promise.all([
    getInvoice(id),
    getAppSettings(),
    listPaymentAccounts({ activeOnly: true }),
    today(),
    // What is still open to credit comes from the engine, so the dialog and the action agree.
    getCreditableLines(id),
    listCreditNotesForInvoice(id),
  ]);
  if (!invoice) notFound();
  return (
    <InvoiceDetailView
      invoice={invoice}
      canEdit={auth.can("SALES", "edit")}
      emailConfigured={await isEmailConfigured()}
      showVat={settings.vatEnabled}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      today={todayDate}
      creditable={creditable}
      creditNotes={creditNotes}
      canCredit={auth.can("SALES", "edit")}
    />
  );
}
