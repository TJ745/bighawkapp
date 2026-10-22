import type { Metadata } from "next";
import { CreditNotesTable } from "@/components/sales/credit-notes-table";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { PageHeader } from "@/components/shared/page-header";
import { StatCards } from "@/components/shared/stat-cards";
import { requirePermission } from "@/lib/auth/session";
import { listCreditNotes } from "@/lib/data/credit-notes";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Credit notes" };

/** Credit notes issued against invoices. Issuing one happens on the invoice it reverses. */
export default async function CreditNotesPage({ searchParams }: PageProps<"/sales/credit-notes">) {
  await requirePermission("SALES", "view");
  const params = parseListParams(await searchParams);
  const { notes, total, credited, refunded } = await listCreditNotes(params);

  return (
    <>
      <PageHeader
        title="Credit notes"
        description={`Invoices put right: goods returned, overcharges corrected, orders cancelled. ${total} ${total === 1 ? "note" : "notes"} in this view.`}
      />
      {/* Cancelled notes credit nothing, so these figures only count the ones that stand. */}
      <StatCards
        columns={2}
        stats={[
          { label: "Credited", value: credited, hint: "Taken off what customers owe" },
          { label: "Refunded", value: refunded, hint: "Money handed back", tone: "danger" },
        ]}
      />
      <ListToolbar
        searchPlaceholder="Search by number, customer, invoice or reason…"
        filters={[
          { value: "all", label: "All" },
          { value: "issued", label: "Issued" },
          { value: "refunded", label: "Refunded" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />
      <CreditNotesTable notes={notes} total={total} page={params.page} searching={Boolean(params.q) || params.filter !== "all"} />
    </>
  );
}
