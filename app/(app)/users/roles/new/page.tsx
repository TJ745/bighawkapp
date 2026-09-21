import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { RoleForm } from "@/components/users/role-form";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New Role" };

export default async function NewRolePage() {
  await requirePermission("USERS", "create");
  return (
    <>
      <PageHeader title="New Role" description="Define a role and what it can access." />
      <RoleForm />
    </>
  );
}
