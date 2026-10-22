import type { Metadata } from "next";
import { ModifiersManager } from "@/components/pos/modifiers-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { listModifierGroups } from "@/lib/data/modifiers";

export const metadata: Metadata = { title: "Modifiers" };

export default async function ModifiersPage() {
  // Module → capability → permission: a retail branch never reaches this page.
  const auth = await requirePosCapability("MODIFIERS", "INVENTORY", "view");
  const groups = await listModifierGroups();

  return (
    <>
      <PageHeader title="Modifiers" description="The questions the till asks when an item is ordered, and what each answer costs." />
      <ModifiersManager groups={groups} canCreate={auth.can("INVENTORY", "create")} canEdit={auth.can("INVENTORY", "edit")} />
    </>
  );
}
