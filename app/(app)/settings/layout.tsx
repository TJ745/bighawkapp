import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePermission("SETTINGS", "view");
  return (
    <>
      <PageHeader title="Settings" description="Company details, numbering, VAT, payment terms and more." />
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <SettingsNav isSuperAdmin={auth.user.isSuperAdmin} />
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </>
  );
}
