import type { Metadata } from "next";
import { ModulesForm, type ModuleBranch } from "@/components/settings/modules-form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getModuleSettings, listBranches } from "@/lib/data/platform";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesSettingsPage() {
  await requireSuperAdmin();
  const [enabled, branches] = await Promise.all([getModuleSettings(), listBranches()]);

  const rows: ModuleBranch[] = branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    isActive: branch.isActive,
    isDefault: branch.isDefault,
    pos: branch.posConfig
      ? {
          businessType: branch.posConfig.businessType,
          isActive: branch.posConfig.isActive,
          receiptHeader: branch.posConfig.receiptHeader,
          receiptFooter: branch.posConfig.receiptFooter,
          scaleBarcodeEnabled: branch.posConfig.scaleBarcodeEnabled,
          scaleBarcodePrefix: branch.posConfig.scaleBarcodePrefix,
          scaleCodeDigits: branch.posConfig.scaleCodeDigits,
          scaleBarcodeMode: branch.posConfig.scaleBarcodeMode,
        }
      : null,
  }));

  return <ModulesForm enabled={enabled} branches={rows} />;
}
