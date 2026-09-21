"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField } from "@/components/shared/form-field";
import { createRole, updateRole } from "@/actions/roles";
import { PERMISSION_ACTIONS, PERMISSION_MODULES, type PermissionAction } from "@/lib/auth/permissions";
import type { RoleDetail } from "@/lib/data/users";
import { applyFieldErrors } from "@/lib/form-errors";
import { roleSchema, type RoleFormValues, type RoleInput } from "@/lib/validation/users";

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
};

type RoleFormProps = {
  role?: RoleDetail;
  readOnly?: boolean;
};

function defaultsFor(role?: RoleDetail): RoleFormValues {
  return {
    name: role?.name ?? "",
    description: role?.description ?? "",
    permissions: PERMISSION_MODULES.map((m) => {
      const p = role?.permissions.find((rp) => rp.module === m.value);
      return {
        module: m.value,
        view: p?.canView ?? false,
        create: p?.canCreate ?? false,
        edit: p?.canEdit ?? false,
        delete: p?.canDelete ?? false,
      };
    }),
  };
}

export function RoleForm({ role, readOnly }: RoleFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RoleFormValues, unknown, RoleInput>({ resolver: zodResolver(roleSchema), defaultValues: defaultsFor(role) });
  const { errors, isSubmitting } = form.formState;
  const permissions = useWatch({ control: form.control, name: "permissions" });

  function setPermission(index: number, action: PermissionAction, checked: boolean) {
    const row = { ...permissions[index], [action]: checked };
    // Any action requires view; removing view removes everything.
    if (action !== "view" && checked) row.view = true;
    if (action === "view" && !checked) {
      row.create = false;
      row.edit = false;
      row.delete = false;
    }
    form.setValue(`permissions.${index}`, row, { shouldDirty: true });
  }

  function setAll(index: number, checked: boolean) {
    form.setValue(
      `permissions.${index}`,
      { module: permissions[index].module, view: checked, create: checked, edit: checked, delete: checked },
      { shouldDirty: true },
    );
  }

  async function onSubmit(values: RoleInput) {
    setFormError(null);
    const result = role ? await updateRole(role.id, values) : await createRole(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success(role ? "Role updated" : "Role created");
    router.push("/users/roles");
    router.refresh();
  }

  const nameLocked = readOnly || role?.isSystem;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
          {role?.isSystem ? <CardDescription>Preset role names cannot be changed.</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label="Role name" htmlFor="role-name" required error={errors.name?.message}>
            <Input id="role-name" disabled={nameLocked} {...form.register("name")} />
          </FormField>
          <FormField label="Description" htmlFor="role-description" error={errors.description?.message}>
            <Input id="role-description" disabled={readOnly} {...form.register("description")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>Choose what users with this role can do in each module.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Module</TableHead>
                  {PERMISSION_ACTIONS.map((action) => (
                    <TableHead key={action} className="w-24 text-center">
                      {ACTION_LABELS[action]}
                    </TableHead>
                  ))}
                  <TableHead className="w-24 pr-6 text-center">All</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERMISSION_MODULES.map((m, index) => {
                  const row = permissions[index];
                  const all = PERMISSION_ACTIONS.every((a) => row[a]);
                  return (
                    <TableRow key={m.value}>
                      <TableCell className="pl-6 font-medium">{m.label}</TableCell>
                      {PERMISSION_ACTIONS.map((action) => (
                        <TableCell key={action} className="text-center">
                          <Checkbox
                            aria-label={`${m.label}: ${ACTION_LABELS[action]}`}
                            checked={row[action]}
                            disabled={readOnly}
                            onCheckedChange={(v) => setPermission(index, action, v === true)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="pr-6 text-center">
                        <Checkbox
                          aria-label={`${m.label}: all`}
                          checked={all}
                          disabled={readOnly}
                          onCheckedChange={(v) => setAll(index, v === true)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/users/roles">{readOnly ? "Back" : "Cancel"}</Link>
        </Button>
        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : null}
            {role ? "Save changes" : "Create role"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
