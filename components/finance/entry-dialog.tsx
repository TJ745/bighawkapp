"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { createExpense, createFinanceCategory, createOtherIncome, updateExpense, updateOtherIncome } from "@/actions/finance";
import type { FinanceCategoryOption, FinanceEntryDetail } from "@/lib/data/finance";
import { applyFieldErrors } from "@/lib/form-errors";
import { financeEntrySchema, type FinanceEntryFormValues, type FinanceEntryValues } from "@/lib/validation/finance";
import { formatFileSize } from "@/components/shared/file-picker";
import { toDateOnly } from "@/lib/dates";

export type AccountOption = { id: string; name: string };

type EntryDialogProps = {
  kind: "income" | "expense";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FinanceCategoryOption[];
  accounts: AccountOption[];
  today: string;
  entry?: FinanceEntryDetail;
  canCreateCategory: boolean;
  readOnly?: boolean;
};

export function EntryDialog({ kind, open, onOpenChange, categories, accounts, today, entry, canCreateCategory, readOnly }: EntryDialogProps) {
  const label = kind === "income" ? "Other Income" : "Expense";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? `Edit ${entry.number}` : `New ${label}`}</DialogTitle>
          <DialogDescription>
            {kind === "income" ? "Money received that is not a customer invoice payment." : "A company expense that is not a supplier purchase payment."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <EntryForm kind={kind} categories={categories} accounts={accounts} today={today} entry={entry} canCreateCategory={canCreateCategory} readOnly={readOnly} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({ kind, categories: initialCategories, accounts, today, entry, canCreateCategory, readOnly, onClose }: Omit<EntryDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  const form = useForm<FinanceEntryFormValues, unknown, FinanceEntryValues>({
    resolver: zodResolver(financeEntrySchema),
    defaultValues: {
      categoryId: entry?.categoryId ?? "",
      amount: entry?.amount ?? 0,
      date: entry ? toDateOnly(entry.date) : today,
      paymentAccountId: entry?.paymentAccountId ?? accounts[0]?.id ?? "",
      description: entry?.description ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [categoryId, accountId] = useWatch({ control: form.control, name: ["categoryId", "paymentAccountId"] });

  async function saveCategory() {
    if (!newCategory?.trim()) return;
    setSavingCategory(true);
    try {
      const result = await createFinanceCategory(kind === "income" ? "INCOME" : "EXPENSE", newCategory);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (!categories.some((c) => c.id === result.data.id)) setCategories([...categories, { ...result.data, isDefault: false }]);
      form.setValue("categoryId", result.data.id, { shouldValidate: true });
      setNewCategory(null);
    } finally {
      setSavingCategory(false);
    }
  }

  async function onSubmit(values: FinanceEntryValues) {
    setFormError(null);
    const formData = new FormData();
    formData.set("categoryId", values.categoryId);
    formData.set("amount", String(values.amount));
    formData.set("date", values.date);
    formData.set("paymentAccountId", values.paymentAccountId);
    formData.set("description", values.description ?? "");
    if (file) formData.set("attachment", file);
    if (removeAttachment) formData.set("removeAttachment", "true");

    const result = entry
      ? kind === "income"
        ? await updateOtherIncome(entry.id, formData)
        : await updateExpense(entry.id, formData)
      : kind === "income"
        ? await createOtherIncome(formData)
        : await createExpense(formData);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success(entry ? "Saved" : kind === "income" ? "Income recorded" : "Expense recorded");
    onClose();
    router.refresh();
  }

  const currentAttachment = removeAttachment ? null : entry?.attachment;

  return (
    <>
    <form id="finance-entry-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <fieldset disabled={readOnly} className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FormField label="Category" htmlFor="entry-category" required error={errors.categoryId?.message}>
        {newCategory === null ? (
          <div className="flex gap-2">
            <Select value={categoryId} onValueChange={(v) => form.setValue("categoryId", v, { shouldValidate: true })}>
              <SelectTrigger id="entry-category" className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCreateCategory ? (
              <Button type="button" variant="outline" size="icon" aria-label="New category" onClick={() => setNewCategory("")}>
                <Plus />
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex gap-2">
            <Input autoFocus placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveCategory())} />
            <Button type="button" size="sm" onClick={saveCategory} disabled={savingCategory || !newCategory.trim()}>
              {savingCategory ? <Loader2 className="animate-spin" /> : null}
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNewCategory(null)}>
              Cancel
            </Button>
          </div>
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Amount (SAR)" htmlFor="entry-amount" required error={errors.amount?.message}>
          <Input id="entry-amount" type="number" step="0.01" min={0} {...form.register("amount")} />
        </FormField>
        <FormField label="Date" htmlFor="entry-date" required error={errors.date?.message}>
          <Input id="entry-date" type="date" {...form.register("date")} />
        </FormField>
      </div>
      <FormField label={kind === "income" ? "Received into" : "Paid from"} htmlFor="entry-account" required error={errors.paymentAccountId?.message}>
        <Select value={accountId} onValueChange={(v) => form.setValue("paymentAccountId", v, { shouldValidate: true })}>
          <SelectTrigger id="entry-account" className="w-full">
            <SelectValue placeholder="Choose account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Description" htmlFor="entry-description" error={errors.description?.message}>
        <Textarea id="entry-description" rows={2} {...form.register("description")} />
      </FormField>
      <FormField label="Attachment" htmlFor="entry-attachment" description="Receipt or supporting document (PDF, JPG, PNG, WEBP; up to 10 MB).">
        {currentAttachment && !file ? (
          <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            <a href={currentAttachment.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
              {currentAttachment.name}
            </a>
            <span className="text-xs text-muted-foreground">{formatFileSize(currentAttachment.size)}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove attachment" onClick={() => setRemoveAttachment(true)}>
              <X />
            </Button>
          </div>
        ) : (
          <Input id="entry-attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        )}
      </FormField>
      </fieldset>
    </form>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        {readOnly ? "Close" : "Cancel"}
      </Button>
      {!readOnly ? (
        <Button type="submit" form="finance-entry-form" disabled={isSubmitting || accounts.length === 0}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {entry ? "Save changes" : kind === "income" ? "Record income" : "Record expense"}
        </Button>
      ) : null}
    </DialogFooter>
    </>
  );
}
