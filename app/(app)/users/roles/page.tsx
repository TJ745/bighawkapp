import type { Metadata } from "next";
import { RolesTable } from "@/components/users/roles-table";
import { UsersPageHeader } from "@/components/users/users-tabs";
import { requirePermission } from "@/lib/auth/session";
import { listRoles } from "@/lib/data/users";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const auth = await requirePermission("USERS", "view");
  const roles = await listRoles();

  return (
    <>
      <UsersPageHeader />
      <RolesTable
        roles={roles}
        canCreate={auth.can("USERS", "create")}
        canEdit={auth.can("USERS", "edit")}
        canDelete={auth.can("USERS", "delete")}
      />
    </>
  );
}
