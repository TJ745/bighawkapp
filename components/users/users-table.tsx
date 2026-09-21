"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, MoreHorizontal, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusMenu } from "@/components/shared/status-menu";
import { setUserActive } from "@/actions/users";
import type { RoleOption, UserListItem } from "@/lib/data/users";
import { getInitials } from "@/lib/format";
import type { PasswordPolicy } from "@/lib/validation/users";
import { UserFormDialog } from "./user-form-dialog";

type UsersTableProps = {
  users: UserListItem[];
  roles: RoleOption[];
  passwordPolicy: PasswordPolicy;
  canCreate: boolean;
  canEdit: boolean;
  currentUserId: string;
  currentUserIsSuperAdmin: boolean;
};

export function UsersTable({
  users,
  roles,
  passwordPolicy,
  canCreate,
  canEdit,
  currentUserId,
  currentUserIsSuperAdmin,
}: UsersTableProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | undefined>();
  const [toggling, setToggling] = useState<UserListItem | undefined>();

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(user: UserListItem) {
    setEditing(user);
    setFormOpen(true);
  }

  async function confirmToggle() {
    if (!toggling) return;
    const result = await setUserActive(toggling.id, !toggling.isActive);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(toggling.isActive ? "User deactivated" : "User activated");
    router.refresh();
  }

  const canEditUser = (user: UserListItem) => canEdit && (!user.isSuperAdmin || currentUserIsSuperAdmin);
  const canToggleUser = (user: UserListItem) => canEdit && !user.isSuperAdmin && user.id !== currentUserId;

  return (
    <>
      <div className="flex justify-end">
        {canCreate ? (
          <Button onClick={openCreate}>
            <Plus />
            New User
          </Button>
        ) : null}
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Users} title="No users yet" description="Add your team members so they can sign in." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <Link href={`/users/${user.id}`} className="flex items-center gap-3 hover:underline">
                      <Avatar className="size-8">
                        <AvatarImage src={user.image ?? undefined} alt="" />
                        <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground md:hidden">{user.email}</p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{user.email}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{user.phone ?? "—"}</TableCell>
                  <TableCell>{user.isSuperAdmin ? "Super Admin" : (user.role?.name ?? "—")}</TableCell>
                  <TableCell>
                    <StatusMenu
                      current={user.isActive ? { label: "Active", tone: "success" } : { label: "Inactive", tone: "neutral" }}
                      choices={canToggleUser(user) ? [user.isActive ? { value: "inactive", label: "Inactive", tone: "neutral", description: "Signs them out and blocks sign-in" } : { value: "active", label: "Active", tone: "success", description: "Lets them sign in again" }] : []}
                      onSelect={(value) => setUserActive(user.id, value === "active")}
                      note={user.isSuperAdmin ? "The Super Admin account is always active." : user.id === currentUserId ? "You cannot deactivate your own account." : undefined}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/users/${user.id}`}>
                            <Eye />
                            View
                          </Link>
                        </DropdownMenuItem>
                        {canEditUser(user) ? (
                          <DropdownMenuItem onSelect={() => openEdit(user)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                        ) : null}
                        {canToggleUser(user) ? (
                          <DropdownMenuItem onSelect={() => setToggling(user)} variant={user.isActive ? "destructive" : "default"}>
                            {user.isActive ? <UserX /> : <UserCheck />}
                            {user.isActive ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} roles={roles} passwordPolicy={passwordPolicy} user={editing} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onOpenChange={(o) => !o && setToggling(undefined)}
        title={toggling?.isActive ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.isActive
            ? "They will be signed out and won't be able to sign in until reactivated."
            : "They will be able to sign in again."
        }
        confirmLabel={toggling?.isActive ? "Deactivate" : "Activate"}
        destructive={toggling?.isActive}
        onConfirm={confirmToggle}
      />
    </>
  );
}
