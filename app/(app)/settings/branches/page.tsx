import type { Metadata } from "next";
import { BranchesForm, type BranchListItem } from "@/components/settings/branches-form";
import { requirePermission } from "@/lib/auth/session";
import { listBranches } from "@/lib/data/platform";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const branches = await listBranches();

  const rows: BranchListItem[] = branches.map((branch) => ({
    id: branch.id,
    code: branch.code,
    name: branch.name,
    phone: branch.phone,
    city: branch.city,
    address: branch.address,
    vatNumber: branch.vatNumber,
    isActive: branch.isActive,
    isDefault: branch.isDefault,
    posType: branch.posConfig?.businessType ?? null,
  }));

  return (
    <BranchesForm
      branches={rows}
      canCreate={auth.can("SETTINGS", "create")}
      canEdit={auth.can("SETTINGS", "edit")}
      posEnabled={auth.hasModule("POS")}
    />
  );
}
