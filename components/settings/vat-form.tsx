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
import { updateVatSettings } from "@/actions/settings";
import type { AppSettings } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { vatSettingsSchema, type VatSettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";
import { SettingSwitchRow } from "./setting-switch-row";

export function VatForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<VatSettingsInput>({
    resolver: zodResolver(vatSettingsSchema),
    defaultValues: {
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
      allowVatChange: settings.allowVatChange,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [vatEnabled, allowVatChange] = useWatch({ control: form.control, name: ["vatEnabled", "allowVatChange"] });

  async function onSubmit(values: VatSettingsInput) {
    setFormError(null);
    const result = await updateVatSettings(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("VAT settings saved");
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
          <CardTitle>VAT</CardTitle>
          <CardDescription>Applied to quotations, invoices, supplier quotations and purchases. Currency is SAR.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SettingSwitchRow
            label="VAT enabled"
            description="When off, documents are created without VAT."
            checked={Boolean(vatEnabled)}
            disabled={!canEdit}
            onCheckedChange={(v) => form.setValue("vatEnabled", v, { shouldDirty: true })}
          />
          <FormField label="Default VAT rate (%)" htmlFor="vat-rate" required error={errors.defaultVatRate?.message} className="max-w-xs">
            <Input id="vat-rate" type="number" step="0.01" min={0} max={100} disabled={!canEdit || !vatEnabled} {...form.register("defaultVatRate")} />
          </FormField>
          <SettingSwitchRow
            label="Allow changing VAT per document"
            description="Users can adjust the VAT rate on individual line items."
            checked={Boolean(allowVatChange)}
            disabled={!canEdit || !vatEnabled}
            onCheckedChange={(v) => form.setValue("allowVatChange", v, { shouldDirty: true })}
          />
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
