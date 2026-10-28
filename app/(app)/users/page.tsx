import type { Metadata } from "next";
import { listBranches } from "@/lib/data/platform";
import { UsersPageHeader } from "@/components/users/users-tabs";
import { UsersTable } from "@/components/users/users-table";
import { requirePermission } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/data/settings";
import { listRoleOptions, listUsers } from "@/lib/data/users";
import { userQuota } from "@/lib/platform/quotas";

export const metadata: Metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const auth = await requirePermission("USERS", "view");
  const [users, roles, passwordPolicy, branches, quota] = await Promise.all([
    listUsers(),
    listRoleOptions(),
    getPasswordPolicy(),
    listBranches(),
    // Seats bought against seats in use, so nobody fills in the form only to be refused.
    userQuota(),
  ]);

  return (
    <>
      <UsersPageHeader />
      <UsersTable
        branches={branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))}
        users={users}
        roles={roles}
        passwordPolicy={passwordPolicy}
        canCreate={auth.can("USERS", "create")}
        quota={quota}
        canEdit={auth.can("USERS", "edit")}
        currentUserId={auth.user.id}
        currentUserIsSuperAdmin={auth.user.isSuperAdmin}
      />
    </>
  );
}
