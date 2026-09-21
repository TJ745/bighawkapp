"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/shared/form-field";
import { updateRegionalSettings } from "@/actions/settings";
import type { AppSettings } from "@/lib/data/settings";
import { createFormatters, CURRENCY } from "@/lib/format";
import { DATE_FORMATS, NUMBER_FORMATS, TIME_ZONES, type DateFormat, type NumberFormat } from "@/lib/settings/defaults";
import { regionalSettingsSchema, type RegionalSettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

export function RegionalForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegionalSettingsInput>({
    resolver: zodResolver(regionalSettingsSchema),
    defaultValues: {
      dateFormat: settings.dateFormat as DateFormat,
      timeZone: settings.timeZone,
      numberFormat: settings.numberFormat as NumberFormat,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [dateFormat, timeZone, numberFormat] = useWatch({ control: form.control, name: ["dateFormat", "timeZone", "numberFormat"] });

  const preview = useMemo(() => {
    const f = createFormatters({ dateFormat, timeZone, numberFormat });
    const now = new Date();
    return { money: f.money(1234567.89), date: f.date(now), dateTime: f.dateTime(now) };
  }, [dateFormat, timeZone, numberFormat]);

  async function onSubmit(values: RegionalSettingsInput) {
    setFormError(null);
    const result = await updateRegionalSettings(values);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    toast.success("Regional settings saved");
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
          <CardTitle>Date & regional</CardTitle>
          <CardDescription>How dates and amounts are displayed across the app and on documents.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label="Currency" htmlFor="currency" description="This app works in a single currency.">
            <Input id="currency" value={`${CURRENCY} — Saudi Riyal`} readOnly disabled />
          </FormField>
          <FormField label="Time zone" htmlFor="time-zone" required error={errors.timeZone?.message}>
            <Select value={timeZone} disabled={!canEdit} onValueChange={(v) => form.setValue("timeZone", v, { shouldDirty: true })}>
              <SelectTrigger id="time-zone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_ZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Date format" htmlFor="date-format" required error={errors.dateFormat?.message}>
            <Select value={dateFormat} disabled={!canEdit} onValueChange={(v) => form.setValue("dateFormat", v as DateFormat, { shouldDirty: true })}>
              <SelectTrigger id="date-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Number format" htmlFor="number-format" required error={errors.numberFormat?.message}>
            <Select
              value={numberFormat}
              disabled={!canEdit}
              onValueChange={(v) => form.setValue("numberFormat", v as NumberFormat, { shouldDirty: true })}
            >
              <SelectTrigger id="number-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm sm:col-span-2">
            <p className="mb-2 font-medium">Preview</p>
            <dl className="grid gap-1 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Amount</dt>
                <dd className="tabular-nums">{preview.money}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Date</dt>
                <dd>{preview.date}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Date & time</dt>
                <dd>{preview.dateTime}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
