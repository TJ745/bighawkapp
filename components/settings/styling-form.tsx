"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { updateStylingSettings } from "@/actions/settings";
import type { AppSettings } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { PDF_FONTS, PDF_HEADER_STYLES } from "@/lib/settings/defaults";
import { stylingSettingsSchema, type StylingSettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

export function StylingForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<StylingSettingsInput>({
    resolver: zodResolver(stylingSettingsSchema),
    defaultValues: {
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      pdfFont: settings.pdfFont,
      pdfHeaderStyle: settings.pdfHeaderStyle,
      pdfFooterText: settings.pdfFooterText,
      emailSignature: settings.emailSignature,
      quotationTerms: settings.quotationTerms,
      invoiceTerms: settings.invoiceTerms,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [primaryColor, secondaryColor, pdfFont, pdfHeaderStyle] = useWatch({
    control: form.control,
    name: ["primaryColor", "secondaryColor", "pdfFont", "pdfHeaderStyle"],
  });

  async function onSubmit(values: StylingSettingsInput) {
    setFormError(null);
    const result = await updateStylingSettings(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Styling saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Document styling</CardTitle>
          <CardDescription>Branding for quotation and invoice PDFs. The logo is set under Company.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <ColorField
            id="primary-color"
            label="Primary colour"
            value={primaryColor ?? ""}
            error={errors.primaryColor?.message}
            disabled={!canEdit}
            onChange={(v) => form.setValue("primaryColor", v, { shouldDirty: true, shouldValidate: true })}
          />
          <ColorField
            id="secondary-color"
            label="Secondary colour"
            value={secondaryColor ?? ""}
            error={errors.secondaryColor?.message}
            disabled={!canEdit}
            onChange={(v) => form.setValue("secondaryColor", v, { shouldDirty: true, shouldValidate: true })}
          />
          <FormField label="Font" htmlFor="pdf-font" required error={errors.pdfFont?.message}>
            <Select value={pdfFont} disabled={!canEdit} onValueChange={(v) => form.setValue("pdfFont", v as StylingSettingsInput["pdfFont"], { shouldDirty: true })}>
              <SelectTrigger id="pdf-font" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PDF_FONTS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label="Header style"
            htmlFor="pdf-header"
            required
            description={PDF_HEADER_STYLES.find((h) => h.value === pdfHeaderStyle)?.description}
            error={errors.pdfHeaderStyle?.message}
          >
            <Select
              value={pdfHeaderStyle}
              disabled={!canEdit}
              onValueChange={(v) => form.setValue("pdfHeaderStyle", v as StylingSettingsInput["pdfHeaderStyle"], { shouldDirty: true })}
            >
              <SelectTrigger id="pdf-header" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PDF_HEADER_STYLES.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Footer text" htmlFor="pdf-footer" description="Printed at the bottom of every PDF page." error={errors.pdfFooterText?.message} className="sm:col-span-2">
            <Input id="pdf-footer" disabled={!canEdit} {...form.register("pdfFooterText")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms & conditions</CardTitle>
          <CardDescription>Default terms added to new documents. They can be edited on each document.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FormField label="Quotation terms" htmlFor="quotation-terms" error={errors.quotationTerms?.message}>
            <Textarea id="quotation-terms" rows={5} disabled={!canEdit} {...form.register("quotationTerms")} />
          </FormField>
          <FormField label="Invoice terms" htmlFor="invoice-terms" error={errors.invoiceTerms?.message}>
            <Textarea id="invoice-terms" rows={5} disabled={!canEdit} {...form.register("invoiceTerms")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email signature</CardTitle>
          <CardDescription>Inserted wherever a template uses {"{{signature}}"}.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Signature" htmlFor="email-signature" error={errors.emailSignature?.message}>
            <Textarea id="email-signature" rows={4} disabled={!canEdit} {...form.register("emailSignature")} />
          </FormField>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}

function ColorField({
  id,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FormField label={label} htmlFor={id} required error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
          value={valid ? value : "#000000"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input id={id} value={value} disabled={disabled} placeholder="#1D4ED8" onChange={(e) => onChange(e.target.value)} className="font-mono uppercase" />
      </div>
    </FormField>
  );
}
