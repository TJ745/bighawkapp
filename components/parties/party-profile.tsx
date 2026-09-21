"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, FileText, Pencil, Power, PowerOff, Receipt, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { setPartyActive } from "@/actions/parties";
import type { PartyDetail, PartyKind } from "@/lib/data/parties";
import { PARTY_CONFIG } from "./party-config";
import { PartyDocuments } from "./party-documents";

type PartyProfileProps = {
  kind: PartyKind;
  party: PartyDetail;
  canEdit: boolean;
  initialTab?: string;
  // Content for transaction tabs, supplied by the Sales/Procurement/Projects modules.
  quotations?: React.ReactNode;
  sales?: React.ReactNode;
  payments?: React.ReactNode;
  projects?: React.ReactNode;
};

export function PartyProfile({ kind, party, canEdit, initialTab, quotations, sales, payments, projects }: PartyProfileProps) {
  const router = useRouter();
  const format = useFormat();
  const config = PARTY_CONFIG[kind];
  const [toggleOpen, setToggleOpen] = useState(false);

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "quotations", label: config.quotationsTab },
    { value: "sales", label: config.salesTab },
    { value: "payments", label: "Payments" },
    ...(kind === "customer" ? [{ value: "projects", label: "Projects" }] : []),
    { value: "documents", label: "Documents" },
  ];
  const defaultTab = tabs.some((t) => t.value === initialTab) ? initialTab! : "overview";

  async function confirmToggle() {
    const result = await setPartyActive(kind, party.id, !party.isActive);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(party.isActive ? `${config.singular} deactivated` : `${config.singular} activated`);
    router.refresh();
  }

  const summary = [
    { label: config.totalLabel, value: party.financials.total, tone: "" },
    { label: "Paid", value: party.financials.paid, tone: "text-success" },
    { label: "Outstanding", value: party.financials.outstanding, tone: party.financials.outstanding > 0 ? "text-warning-foreground dark:text-warning" : "" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {party.type === "COMPANY" ? <Building2 className="size-6" /> : <User className="size-6" />}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{party.name}</h1>
              <StatusBadge tone={party.isActive ? "success" : "neutral"}>{party.isActive ? "Active" : "Inactive"}</StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              {party.type === "COMPANY" ? "Company" : "Individual"}
              {party.contactPerson ? ` · ${party.contactPerson}` : ""} · {party.phone}
              {party.email ? ` · ${party.email}` : ""}
            </p>
          </div>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`${config.basePath}/${party.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            <Button variant={party.isActive ? "ghost" : "default"} onClick={() => setToggleOpen(true)}>
              {party.isActive ? <PowerOff /> : <Power />}
              {party.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summary.map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{format.money(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue={defaultTab}>
        {/* no-scrollbar: the strip still scrolls by swipe on narrow screens, without the scrollbar band. */}
        <TabsList className="no-scrollbar h-auto w-full justify-start overflow-x-auto sm:w-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <Overview party={party} />
        </TabsContent>
        <TabsContent value="quotations" className="pt-4">
          {quotations ?? <EmptyState icon={FileText} title={`No ${config.quotationsTab.toLowerCase()} yet`} />}
        </TabsContent>
        <TabsContent value="sales" className="pt-4">
          {sales ?? <EmptyState icon={Receipt} title={`No ${config.salesTab.toLowerCase()} yet`} />}
        </TabsContent>
        <TabsContent value="payments" className="pt-4">
          {payments ?? <EmptyState icon={Wallet} title="No payments yet" />}
        </TabsContent>
        {kind === "customer" ? (
          <TabsContent value="projects" className="pt-4">
            {projects ?? <EmptyState icon={FileText} title="No projects yet" />}
          </TabsContent>
        ) : null}
        <TabsContent value="documents" className="pt-4">
          <PartyDocuments kind={kind} partyId={party.id} documents={party.documents} canEdit={canEdit} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        title={party.isActive ? `Deactivate ${party.name}?` : `Activate ${party.name}?`}
        description={
          party.isActive
            ? `Inactive ${config.plural.toLowerCase()} are hidden from pickers when creating new documents. History is kept.`
            : `The ${config.singular.toLowerCase()} will be available again when creating documents.`
        }
        confirmLabel={party.isActive ? "Deactivate" : "Activate"}
        destructive={party.isActive}
        onConfirm={confirmToggle}
      />
    </div>
  );
}

function Overview({ party }: { party: PartyDetail }) {
  const sections: { title: string; items: { label: string; value: string | null }[] }[] = [
    {
      title: "Contact",
      items: [
        { label: "Contact person", value: party.type === "COMPANY" ? party.contactPerson : null },
        { label: "Phone", value: party.phone },
        { label: "Email", value: party.email },
        { label: "Address", value: party.address },
      ],
    },
    {
      title: "Registration",
      items: [
        { label: "VAT number", value: party.vatNumber },
        { label: "CR number", value: party.type === "COMPANY" ? party.crNumber : null },
        { label: "National address", value: party.nationalAddress },
      ],
    },
    {
      title: "Bank details",
      items: [
        { label: "Bank", value: party.bankName },
        { label: "Account name", value: party.accountName },
        { label: "IBAN", value: party.iban },
        { label: "Account number", value: party.accountNumber },
      ],
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title} size="sm">
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {section.items
                .filter((i) => i.label !== "Contact person" && i.label !== "CR number" ? true : party.type === "COMPANY")
                .map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="break-words font-medium">{item.value || "—"}</dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>
      ))}
      <Card size="sm" className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{party.notes || <span className="text-muted-foreground">No notes.</span>}</p>
        </CardContent>
      </Card>
    </div>
  );
}
