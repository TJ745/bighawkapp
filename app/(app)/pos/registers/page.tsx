import type { Metadata } from "next";
import { RegistersManager } from "@/components/pos/registers-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisters } from "@/lib/data/pos";
import { listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Registers" };

export default async function RegistersPage() {
  const auth = await requireModule("POS", "INVENTORY", "view");
  const branch = await getCurrentBranch();
  const [registers, accounts] = await Promise.all([listRegisters(branch.id), listPaymentAccounts({ activeOnly: true })]);

  return (
    <>
      <PageHeader title="Registers" description={`Tills at ${branch.name}. Each one keeps its own shifts and drawer.`} />
      <RegistersManager
        registers={registers.map((r) => ({
          id: r.id,
          name: r.name,
          isActive: r.isActive,
          cashAccountId: r.cashAccountId,
          cashAccountName: r.cashAccount?.name ?? null,
          hasOpenShift: r.shifts.length > 0,
        }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        branchName={branch.name}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
