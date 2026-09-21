"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { useFormat } from "@/components/providers/format-provider";
import type { ActionResult } from "@/lib/actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { invoicePaymentSchema, type InvoicePaymentFormValues, type InvoicePaymentValues } from "@/lib/validation/sales";

export type PaymentAccountOption = { id: string; name: string };

type RecordPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentNumber: string;
  remaining: number;
  today: string;
  accounts: PaymentAccountOption[];
  // "received" for customer payments, "paid" for supplier payments.
  direction: "received" | "paid";
  record: (values: InvoicePaymentValues) => Promise<ActionResult>;
};

export function RecordPaymentDialog({ open, onOpenChange, documentNumber, remaining, today, accounts, direction, record }: RecordPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {direction === "received" ? "Money received against" : "Money paid against"} {documentNumber}.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PaymentForm remaining={remaining} today={today} accounts={accounts} direction={direction} record={record} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  remaining,
  today,
  accounts,
  direction,
  record,
  onClose,
}: Omit<RecordPaymentDialogProps, "open" | "onOpenChange" | "documentNumber"> & { onClose: () => void }) {
  const router = useRouter();
  const format = useFormat();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<InvoicePaymentFormValues, unknown, InvoicePaymentValues>({
    resolver: zodResolver(invoicePaymentSchema),
    defaultValues: { amount: remaining, date: today, paymentAccountId: accounts[0]?.id ?? "", reference: "", notes: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const [amount, accountId] = useWatch({ control: form.control, name: ["amount", "paymentAccountId"] });
  const after = Math.max(0, remaining - (Number(amount) || 0));

  async function onSubmit(values: InvoicePaymentValues) {
    setFormError(null);
    const result = await record(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Payment recorded");
    onClose();
    router.refresh();
  }

  return (
    <>
    <form id="record-payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Remaining balance</span>
          <span className="font-medium tabular-nums">{format.money(remaining)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">After this payment</span>
          <span className="font-medium tabular-nums">{format.money(after)}</span>
        </div>
      </div>
      <FormField label="Amount (SAR)" htmlFor="pay-amount" required error={errors.amount?.message}>
        <Input id="pay-amount" type="number" step="0.01" min={0} autoFocus {...form.register("amount")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payment date" htmlFor="pay-date" required error={errors.date?.message}>
          <Input id="pay-date" type="date" {...form.register("date")} />
        </FormField>
        <FormField label={direction === "received" ? "Received into" : "Paid from"} htmlFor="pay-account" required error={errors.paymentAccountId?.message}>
          <Select value={accountId} onValueChange={(v) => form.setValue("paymentAccountId", v, { shouldValidate: true })}>
            <SelectTrigger id="pay-account" className="w-full">
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
      </div>
      <FormField label="Reference" htmlFor="pay-ref" description="Transfer number, cheque number…" error={errors.reference?.message}>
        <Input id="pay-ref" {...form.register("reference")} />
      </FormField>
      <FormField label="Notes" htmlFor="pay-notes" error={errors.notes?.message}>
        <Textarea id="pay-notes" rows={2} {...form.register("notes")} />
      </FormField>
    </form>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" form="record-payment-form" disabled={isSubmitting || accounts.length === 0}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Record payment
      </Button>
    </DialogFooter>
    </>
  );
}
