import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { RoleForm } from "@/components/users/role-form";
import { requirePermission } from "@/lib/auth/session";
import { permissionModulesFor } from "@/lib/platform/modules";

export const metadata: Metadata = { title: "New Role" };

export default async function NewRolePage() {
  const auth = await requirePermission("USERS", "create");
  return (
    <>
      <PageHeader title="New Role" description="Define a role and what it can access." />
      <RoleForm shownModules={permissionModulesFor(auth.enabledModules)} />
    </>
  );
}
