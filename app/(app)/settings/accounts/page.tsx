import type { Metadata } from "next";
import { PaymentAccountsCard } from "@/components/settings/payment-accounts";
import { requirePermission } from "@/lib/auth/session";
import { getAccountBalances } from "@/lib/business/finance";
import { listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Payment Accounts" };

export default async function PaymentAccountsSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const [accounts, balances] = await Promise.all([listPaymentAccounts(), getAccountBalances()]);
  return <PaymentAccountsCard accounts={accounts} balances={Object.fromEntries(balances.map((b) => [b.id, b.balance]))} canEdit={auth.can("SETTINGS", "edit")} />;
}
