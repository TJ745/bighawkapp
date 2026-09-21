import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { RoleForm } from "@/components/users/role-form";
import { requirePermission } from "@/lib/auth/session";
import { getRole } from "@/lib/data/users";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params }: PageProps<"/users/roles/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("USERS", "view");
  const role = await getRole(id);
  if (!role) notFound();

  const canEdit = auth.can("USERS", "edit");

  return (
    <>
      <PageHeader
        title={role.name}
        description={canEdit ? "Adjust what this role can access." : "Permissions for this role."}
      />
      <RoleForm role={role} readOnly={!canEdit} />
    </>
  );
}
