import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { UserDetailView } from "@/components/users/user-detail";
import { requirePermission } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/data/settings";
import { getUser, listRoleOptions } from "@/lib/data/users";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("USERS", "view");
  const [user, roles, passwordPolicy] = await Promise.all([getUser(id), listRoleOptions(), getPasswordPolicy()]);
  // The Super Admin account is hidden from Users & Roles, including its detail page.
  if (!user || user.isSuperAdmin) notFound();

  const canEdit = auth.can("USERS", "edit") && (!user.isSuperAdmin || auth.user.isSuperAdmin);
  const canToggle = auth.can("USERS", "edit") && !user.isSuperAdmin && user.id !== auth.user.id;

  return (
    <>
      <PageHeader
        title="User"
        actions={
          <Button asChild variant="ghost">
            <Link href="/users">
              <ArrowLeft />
              All users
            </Link>
          </Button>
        }
      />
      <UserDetailView user={user} roles={roles} passwordPolicy={passwordPolicy} canEdit={canEdit} canToggle={canToggle} />
    </>
  );
}
