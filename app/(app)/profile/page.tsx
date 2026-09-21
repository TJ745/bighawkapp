import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessCard } from "@/components/profile/access-card";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { ProfileDetailsForm } from "@/components/profile/profile-details-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireAuth } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/data/settings";
import { getUser } from "@/lib/data/users";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const auth = await requireAuth();
  const [user, passwordPolicy, format] = await Promise.all([getUser(auth.user.id), getPasswordPolicy(), getFormatters()]);
  if (!user) notFound();

  return (
    <>
      <PageHeader title="My Profile" description="Your details, password and what you have access to." />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ProfileDetailsForm user={user} />
          <ChangePasswordForm passwordPolicy={passwordPolicy} />
        </div>
        <AccessCard
          roleName={user.role?.name ?? null}
          isSuperAdmin={user.isSuperAdmin}
          isActive={user.isActive}
          memberSince={format.date(user.createdAt)}
          permissions={auth.permissions}
        />
      </div>
    </>
  );
}
