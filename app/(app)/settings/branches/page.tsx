import type { Metadata } from "next";
import { BranchesForm, type BranchListItem } from "@/components/settings/branches-form";
import { requirePermission } from "@/lib/auth/session";
import { listBranches } from "@/lib/data/platform";
import { branchQuota } from "@/lib/platform/quotas";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  // Branches bought against branches open, counted the same way the refusal counts them.
  const [branches, quota] = await Promise.all([listBranches(), branchQuota()]);

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
      quota={quota}
      canEdit={auth.can("SETTINGS", "edit")}
      posEnabled={auth.hasModule("POS")}
    />
  );
}
