"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { deleteRole } from "@/actions/roles";
import type { RoleListItem } from "@/lib/data/users";
import { PERMISSION_MODULES } from "@/lib/auth/permissions";

type RolesTableProps = {
  roles: RoleListItem[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function summarizeAccess(role: RoleListItem) {
  const names = role.permissions
    .filter((p) => p.canView)
    .map((p) => PERMISSION_MODULES.find((m) => m.value === p.module)?.label ?? p.module);
  if (names.length === 0) return "No access";
  if (names.length === PERMISSION_MODULES.length) return "All modules";
  return names.join(", ");
}

export function RolesTable({ roles, canCreate, canEdit, canDelete }: RolesTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<RoleListItem | undefined>();

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deleteRole(deleting.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Role deleted");
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-end">
        {canCreate ? (
          <Button asChild>
            <Link href="/users/roles/new">
              <Plus />
              New Role
            </Link>
          </Button>
        ) : null}
      </div>

      {roles.length === 0 ? (
        <EmptyState icon={Shield} title="No roles yet" description="Create a role to define what users can access." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Access</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <Link href={`/users/roles/${role.id}`} className="font-medium hover:underline">
                      {role.name}
                    </Link>
                    {role.description ? <p className="text-xs text-muted-foreground">{role.description}</p> : null}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">{summarizeAccess(role)}</TableCell>
                  <TableCell>{role._count.users}</TableCell>
                  <TableCell>
                    <StatusBadge tone={role.isSystem ? "info" : "neutral"}>{role.isSystem ? "Preset" : "Custom"}</StatusBadge>
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
                          <Link href={`/users/roles/${role.id}`}>
                            <Pencil />
                            {canEdit ? "Edit" : "View"}
                          </Link>
                        </DropdownMenuItem>
                        {canDelete && !role.isSystem ? (
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(role)}>
                            <Trash2 />
                            Delete
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

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={`Delete role "${deleting?.name}"?`}
        description="This cannot be undone. Roles that are assigned to users cannot be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
