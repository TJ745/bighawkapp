"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { setUserActive } from "@/actions/users";
import type { RoleOption, UserDetail } from "@/lib/data/users";
import { getInitials } from "@/lib/format";
import { useFormat } from "@/components/providers/format-provider";
import type { PasswordPolicy } from "@/lib/validation/users";
import { UserFormDialog } from "./user-form-dialog";

type UserDetailViewProps = {
  user: UserDetail;
  roles: RoleOption[];
  passwordPolicy: PasswordPolicy;
  canEdit: boolean;
  canToggle: boolean;
};

export function UserDetailView({ user, roles, passwordPolicy, canEdit, canToggle }: UserDetailViewProps) {
  const router = useRouter();
  const format = useFormat();
  const [editOpen, setEditOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  async function confirmToggle() {
    const result = await setUserActive(user.id, !user.isActive);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(user.isActive ? "User deactivated" : "User activated");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar className="size-20">
            <AvatarImage src={user.image ?? undefined} alt="" />
            <AvatarFallback className="text-xl">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{user.name}</h2>
              <StatusBadge tone={user.isActive ? "success" : "neutral"}>{user.isActive ? "Active" : "Inactive"}</StatusBadge>
            </div>
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Email" value={user.email} />
              <Item label="Phone" value={user.phone ?? "—"} />
              <Item label="Role" value={user.isSuperAdmin ? "Super Admin" : (user.role?.name ?? "—")} />
              <Item label="Member since" value={format.date(user.createdAt)} />
            </dl>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil />
                Edit
              </Button>
            ) : null}
            {canToggle ? (
              <Button variant={user.isActive ? "destructive" : "default"} onClick={() => setToggleOpen(true)}>
                {user.isActive ? <UserX /> : <UserCheck />}
                {user.isActive ? "Deactivate" : "Activate"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <UserFormDialog open={editOpen} onOpenChange={setEditOpen} roles={roles} passwordPolicy={passwordPolicy} user={user} />
      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        title={user.isActive ? `Deactivate ${user.name}?` : `Activate ${user.name}?`}
        description={
          user.isActive
            ? "They will be signed out and won't be able to sign in until reactivated."
            : "They will be able to sign in again."
        }
        confirmLabel={user.isActive ? "Deactivate" : "Activate"}
        destructive={user.isActive}
        onConfirm={confirmToggle}
      />
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
