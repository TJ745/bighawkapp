import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerInvoicesTab, CustomerPaymentsTab, CustomerQuotationsTab } from "@/components/sales/customer-tabs";
import { SupplierPaymentsTab, SupplierPurchasesTab, SupplierQuotationsTab } from "@/components/procurement/supplier-tabs";
import { CustomerProjectsTab } from "@/components/projects/project-tabs";
import type { PermissionModule } from "@/lib/generated/prisma/enums";
import { requirePermission } from "@/lib/auth/session";
import { getCustomer, getSupplier, listCustomers, listSuppliers, type PartyKind } from "@/lib/data/parties";
import { parseListParams } from "@/lib/list-params";
import { PARTY_CONFIG } from "./party-config";
import { PartyForm } from "./party-form";
import { PartyProfile } from "./party-profile";
import { PartyTable } from "./party-table";

// Server-side page bodies shared by /customers/* and /procurement/suppliers/*.

const MODULE: Record<PartyKind, PermissionModule> = { customer: "CUSTOMERS", supplier: "PROCUREMENT" };
type SearchParams = Record<string, string | string[] | undefined>;

export async function PartyListPage({ kind, searchParams }: { kind: PartyKind; searchParams: SearchParams }) {
  const auth = await requirePermission(MODULE[kind], "view");
  const params = parseListParams(searchParams);
  const { items, total } = kind === "customer" ? await listCustomers(params) : await listSuppliers(params);
  const config = PARTY_CONFIG[kind];

  return (
    <>
      <PageHeader
        title={config.plural}
        description={kind === "customer" ? "Companies and individuals you sell to." : "Companies and individuals you buy from."}
      />
      <PartyTable
        kind={kind}
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can(MODULE[kind], "create")}
        canEdit={auth.can(MODULE[kind], "edit")}
      />
    </>
  );
}

export async function PartyNewPage({ kind }: { kind: PartyKind }) {
  await requirePermission(MODULE[kind], "create");
  const config = PARTY_CONFIG[kind];
  return (
    <>
      <PageHeader title={`New ${config.singular}`} actions={<BackButton href={config.basePath} label={`All ${config.plural.toLowerCase()}`} />} />
      <PartyForm kind={kind} />
    </>
  );
}

export async function PartyDetailPage({ kind, id, searchParams }: { kind: PartyKind; id: string; searchParams: SearchParams }) {
  const auth = await requirePermission(MODULE[kind], "view");
  const party = kind === "customer" ? await getCustomer(id) : await getSupplier(id);
  if (!party) notFound();
  const config = PARTY_CONFIG[kind];
  const tab = typeof searchParams.tab === "string" ? searchParams.tab : undefined;

  // Transaction tabs come from the Sales (customers) / Procurement (suppliers) modules — when the user may view them.
  const salesTabs =
    kind === "customer" && auth.can("SALES", "view")
      ? {
          quotations: <CustomerQuotationsTab customerId={party.id} canCreate={auth.can("SALES", "create")} canEdit={auth.can("SALES", "edit")} />,
          sales: <CustomerInvoicesTab customerId={party.id} canCreate={auth.can("SALES", "create")} canEdit={auth.can("SALES", "edit")} />,
          payments: <CustomerPaymentsTab customerId={party.id} />,
        }
      : kind === "supplier"
        ? {
            quotations: <SupplierQuotationsTab supplierId={party.id} canCreate={auth.can("PROCUREMENT", "create")} canEdit={auth.can("PROCUREMENT", "edit")} />,
            sales: <SupplierPurchasesTab supplierId={party.id} canCreate={auth.can("PROCUREMENT", "create")} canEdit={auth.can("PROCUREMENT", "edit")} />,
            payments: <SupplierPaymentsTab supplierId={party.id} />,
          }
        : {};

  return (
    <>
      <div>
        <BackButton href={config.basePath} label={`All ${config.plural.toLowerCase()}`} />
      </div>
      <PartyProfile
        kind={kind}
        party={party}
        canEdit={auth.can(MODULE[kind], "edit")}
        initialTab={tab}
        {...salesTabs}
        projects={kind === "customer" && auth.can("PROJECTS", "view") ? <CustomerProjectsTab customerId={party.id} auth={auth} /> : undefined}
      />
    </>
  );
}

export async function PartyEditPage({ kind, id }: { kind: PartyKind; id: string }) {
  await requirePermission(MODULE[kind], "edit");
  const party = kind === "customer" ? await getCustomer(id) : await getSupplier(id);
  if (!party) notFound();
  const config = PARTY_CONFIG[kind];
  return (
    <>
      <PageHeader title={`Edit ${config.singular}`} description={party.name} actions={<BackButton href={`${config.basePath}/${id}`} label="Back" />} />
      <PartyForm kind={kind} party={party} />
    </>
  );
}

function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={href}>
        <ArrowLeft />
        {label}
      </Link>
    </Button>
  );
}
