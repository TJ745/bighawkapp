"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MapPin, Pencil, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QuotaNote } from "@/components/shared/quota-note";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { createBranch, setDefaultBranch, updateBranch } from "@/actions/platform";
import { applyFieldErrors } from "@/lib/form-errors";
import { branchSchema, type BranchInput } from "@/lib/validation/platform";
import { posTypeLabel } from "@/lib/platform/pos-types";
import type { PosBusinessType } from "@/lib/generated/prisma/enums";

export type BranchListItem = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  vatNumber: string | null;
  isActive: boolean;
  isDefault: boolean;
  posType: PosBusinessType | null;
};

type Props = {
  branches: BranchListItem[];
  canCreate: boolean;
  canEdit: boolean;
  posEnabled: boolean;
  /** Branches open against branches bought, shown beside the button that opens one. */
  quota: { used: number; limit: number; remaining: number };
};

export function BranchesForm({ branches, canCreate, canEdit, posEnabled, quota }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<BranchListItem | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(branch: BranchListItem) {
    setEditing(branch);
    setOpen(true);
  }

  function makeDefault(branch: BranchListItem) {
    startTransition(async () => {
      const result = await setDefaultBranch(branch.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${branch.name} is now the default branch`);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
          <CardDescription>
            Your locations. Each branch can run its own POS industry, and POS registers, shifts and sales are recorded against a branch.
          </CardDescription>
          <QuotaNote used={quota.used} limit={quota.limit} noun="branches" />
          {canCreate ? (
            <Button onClick={openCreate} className="row-start-1 justify-self-end" disabled={quota.remaining === 0}>
              <Plus />
              New Branch
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead className="hidden sm:table-cell">City</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                {posEnabled ? <TableHead className="hidden lg:table-cell">POS industry</TableHead> : null}
                <TableHead>Status</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <MapPin className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {branch.name}
                          {branch.isDefault ? <span className="ml-2 text-xs font-normal text-muted-foreground">Default</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{branch.code}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{branch.city ?? "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{branch.phone ?? "—"}</TableCell>
                  {posEnabled ? (
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{branch.posType ? posTypeLabel(branch.posType) : "Not configured"}</TableCell>
                  ) : null}
                  <TableCell>
                    <StatusBadge tone={branch.isActive ? "success" : "neutral"}>{branch.isActive ? "Active" : "Inactive"}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {canEdit && !branch.isDefault && branch.isActive ? (
                        <Button variant="ghost" size="icon" aria-label="Make default" title="Make default" disabled={pending} onClick={() => makeDefault(branch)}>
                          <Star />
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button variant="ghost" size="icon" aria-label="Edit branch" title="Edit" onClick={() => openEdit(branch)}>
                          <Pencil />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit branch" : "New branch"}</DialogTitle>
            <DialogDescription>{editing ? "Update this location's details." : "Add another location for this company."}</DialogDescription>
          </DialogHeader>
          {open ? <BranchForm branch={editing} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BranchForm({ branch, onClose }: { branch: BranchListItem | null; onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<BranchInput>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      code: branch?.code ?? "",
      name: branch?.name ?? "",
      phone: branch?.phone ?? "",
      city: branch?.city ?? "",
      address: branch?.address ?? "",
      vatNumber: branch?.vatNumber ?? "",
      isActive: branch?.isActive ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const isActive = useWatch({ control: form.control, name: "isActive" });

  async function onSubmit(values: BranchInput) {
    setFormError(null);
    const formData = new FormData();
    formData.set("code", values.code);
    formData.set("name", values.name);
    formData.set("phone", values.phone ?? "");
    formData.set("city", values.city ?? "");
    formData.set("address", values.address ?? "");
    formData.set("vatNumber", values.vatNumber ?? "");
    formData.set("isActive", String(values.isActive ?? true));

    const result = branch ? await updateBranch(branch.id, formData) : await createBranch(formData);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success(branch ? "Branch updated" : "Branch created");
    onClose();
    router.refresh();
  }

  return (
    <>
      <form id="branch-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name" htmlFor="branch-name" required error={errors.name?.message}>
            <Input id="branch-name" autoComplete="off" {...form.register("name")} />
          </FormField>
          <FormField label="Code" htmlFor="branch-code" required error={errors.code?.message} description="Short identifier, e.g. RUH or MAIN.">
            <Input id="branch-code" autoComplete="off" className="uppercase" {...form.register("code")} />
          </FormField>
          <FormField label="City" htmlFor="branch-city" error={errors.city?.message}>
            <Input id="branch-city" autoComplete="off" {...form.register("city")} />
          </FormField>
          <FormField label="Phone" htmlFor="branch-phone" error={errors.phone?.message}>
            <Input id="branch-phone" type="tel" autoComplete="off" {...form.register("phone")} />
          </FormField>
          <FormField label="Address" htmlFor="branch-address" error={errors.address?.message} className="sm:col-span-2">
            <Input id="branch-address" autoComplete="off" {...form.register("address")} />
          </FormField>
          <FormField
            label="VAT number"
            htmlFor="branch-vat"
            error={errors.vatNumber?.message}
            description="Only when this branch invoices under its own number."
            className="sm:col-span-2"
          >
            <Input id="branch-vat" autoComplete="off" {...form.register("vatNumber")} />
          </FormField>
        </div>

        <SettingSwitchRow
          label="Active"
          description="Inactive branches are hidden from the branch picker and from POS."
          checked={isActive !== false}
          onCheckedChange={(v) => form.setValue("isActive", v, { shouldDirty: true })}
        />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form="branch-form" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {branch ? "Save changes" : "Create branch"}
        </Button>
      </DialogFooter>
    </>
  );
}
