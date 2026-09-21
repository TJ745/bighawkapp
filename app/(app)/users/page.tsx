import type { Metadata } from "next";
import { UsersPageHeader } from "@/components/users/users-tabs";
import { UsersTable } from "@/components/users/users-table";
import { requirePermission } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/data/settings";
import { listRoleOptions, listUsers } from "@/lib/data/users";

export const metadata: Metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const auth = await requirePermission("USERS", "view");
  const [users, roles, passwordPolicy] = await Promise.all([listUsers(), listRoleOptions(), getPasswordPolicy()]);

  return (
    <>
      <UsersPageHeader />
      <UsersTable
        users={users}
        roles={roles}
        passwordPolicy={passwordPolicy}
        canCreate={auth.can("USERS", "create")}
        canEdit={auth.can("USERS", "edit")}
        currentUserId={auth.user.id}
        currentUserIsSuperAdmin={auth.user.isSuperAdmin}
      />
    </>
  );
}
