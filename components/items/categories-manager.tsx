"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderTree, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { createItemCategory, updateItemCategory } from "@/actions/items";
import { applyFieldErrors } from "@/lib/form-errors";
import type { ItemCategoryRow } from "@/lib/data/items";
import { itemCategorySchema, type ItemCategoryInput } from "@/lib/validation/items";

type Props = { categories: ItemCategoryRow[]; canCreate: boolean; canEdit: boolean };

export function CategoriesManager({ categories, canCreate, canEdit }: Props) {
  const [editing, setEditing] = useState<ItemCategoryRow | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Category
    </Button>
  ) : null;

  return (
    <>
      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Categories group what you sell so the register and reports stay navigable."
          action={newButton}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Used to group products and services on the register and in reports.</CardDescription>
            {newButton ? <div className="row-start-1 justify-self-end">{newButton}</div> : null}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="hidden sm:table-cell">Description</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{category.description ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{category.itemCount}</TableCell>
                    <TableCell>
                      <StatusBadge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "Active" : "Inactive"}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit category"
                            onClick={() => {
                              setEditing(category);
                              setOpen(true);
                            }}
                          >
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
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>{editing ? "Rename or reorder this category." : "Group similar products and services together."}</DialogDescription>
          </DialogHeader>
          {open ? <CategoryForm category={editing} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryForm({ category, onClose }: { category: ItemCategoryRow | null; onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ItemCategoryInput>({
    resolver: zodResolver(itemCategorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      sortOrder: category?.sortOrder ?? 0,
      isActive: category?.isActive ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const isActive = useWatch({ control: form.control, name: "isActive" });

  async function onSubmit(values: ItemCategoryInput) {
    setFormError(null);
    const result = category ? await updateItemCategory(category.id, values) : await createItemCategory(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success(category ? "Category saved" : "Category created");
    onClose();
    router.refresh();
  }

  return (
    <>
      <form id="category-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Name" htmlFor="category-name" required error={errors.name?.message}>
          <Input id="category-name" autoComplete="off" {...form.register("name")} />
        </FormField>
        <FormField label="Description" htmlFor="category-description" error={errors.description?.message}>
          <Input id="category-description" autoComplete="off" {...form.register("description")} />
        </FormField>
        <FormField label="Sort order" htmlFor="category-sort" error={errors.sortOrder?.message} description="Lower numbers appear first.">
          <Input id="category-sort" type="number" inputMode="numeric" className="max-w-28" {...form.register("sortOrder")} />
        </FormField>
        <SettingSwitchRow
          label="Active"
          description="Inactive categories are hidden when adding items."
          checked={isActive !== false}
          onCheckedChange={(v) => form.setValue("isActive", v, { shouldDirty: true })}
        />
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" form="category-form" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {category ? "Save changes" : "Create category"}
        </Button>
      </DialogFooter>
    </>
  );
}
