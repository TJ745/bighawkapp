"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { PaymentTermSelect } from "@/components/shared/payment-term-select";
import { updatePaymentTermsSettings } from "@/actions/settings";
import type { AppSettings } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { paymentTermsSettingsSchema, type PaymentTermsSettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

export function PaymentTermsForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PaymentTermsSettingsInput>({
    resolver: zodResolver(paymentTermsSettingsSchema),
    defaultValues: {
      defaultPaymentTermDays: settings.defaultPaymentTermDays,
      defaultDepositPercent: settings.defaultDepositPercent,
      defaultRemainingDueDays: settings.defaultRemainingDueDays,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [termDays, depositPercent, remainingDays] = useWatch({
    control: form.control,
    name: ["defaultPaymentTermDays", "defaultDepositPercent", "defaultRemainingDueDays"],
  });
  const deposit = Math.min(100, Math.max(0, Number(depositPercent) || 0));

  async function onSubmit(values: PaymentTermsSettingsInput) {
    setFormError(null);
    const result = await updatePaymentTermsSettings(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Payment terms saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {formError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Payment terms</CardTitle>
          <CardDescription>Defaults for new invoices and purchases. They can be changed on each document.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField label="Default payment term" htmlFor="term-days" required error={errors.defaultPaymentTermDays?.message} className="max-w-xs">
            <PaymentTermSelect
              id="term-days"
              value={Number(termDays) || 0}
              disabled={!canEdit}
              onChange={(v) => form.setValue("defaultPaymentTermDays", v, { shouldDirty: true, shouldValidate: true })}
            />
          </FormField>

          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Deposit</p>
              <p className="text-xs text-muted-foreground">
                Optional split payment, e.g. 30% deposit and the remaining 70% within 30 days. Leave the deposit at 0% for a single payment.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <FormField label="Deposit (%)" htmlFor="deposit-percent" error={errors.defaultDepositPercent?.message}>
                <Input id="deposit-percent" type="number" min={0} max={100} step="0.01" disabled={!canEdit} {...form.register("defaultDepositPercent")} />
              </FormField>
              <FormField label="Remaining (%)" htmlFor="remaining-percent" description="Calculated automatically.">
                <Input id="remaining-percent" value={(100 - deposit).toFixed(2).replace(/\.00$/, "")} readOnly disabled />
              </FormField>
              <FormField label="Remaining due within" htmlFor="remaining-days" error={errors.defaultRemainingDueDays?.message}>
                <PaymentTermSelect
                  id="remaining-days"
                  value={Number(remainingDays) || 0}
                  disabled={!canEdit || deposit === 0}
                  onChange={(v) => form.setValue("defaultRemainingDueDays", v, { shouldDirty: true, shouldValidate: true })}
                />
              </FormField>
            </div>
          </div>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
