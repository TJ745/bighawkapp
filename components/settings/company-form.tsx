"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { updateCompanySettings } from "@/actions/settings";
import type { CompanySettings } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { companySettingsSchema, type CompanySettingsInput, type CompanySettingsValues } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

const FIELDS: { name: keyof CompanySettingsInput; label: string; required?: boolean; type?: string; wide?: boolean; multiline?: boolean }[] = [
  { name: "companyName", label: "Company name", required: true },
  { name: "crNumber", label: "CR number" },
  { name: "vatNumber", label: "VAT number" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "email", label: "Email", type: "email" },
  { name: "website", label: "Website" },
  { name: "address", label: "Address", wide: true, multiline: true },
  { name: "nationalAddress", label: "National address", wide: true },
  { name: "description", label: "Company description", wide: true, multiline: true },
  { name: "additionalContact", label: "Additional contact information", wide: true, multiline: true },
];

const BANK_FIELDS: { name: keyof CompanySettingsInput; label: string }[] = [
  { name: "bankName", label: "Bank name" },
  { name: "accountName", label: "Account name" },
  { name: "iban", label: "IBAN" },
  { name: "accountNumber", label: "Account number" },
];

export function CompanyForm({ company, canEdit }: { company: CompanySettings; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CompanySettingsInput, unknown, CompanySettingsValues>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: Object.fromEntries(
      [...FIELDS, ...BANK_FIELDS].map((f) => [f.name, (company[f.name as keyof CompanySettings] as string | null) ?? ""]),
    ) as CompanySettingsInput,
  });
  const { errors, isSubmitting } = form.formState;

  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const currentLogo = removeLogo ? null : (preview ?? company.logoUrl);

  async function onSubmit(values: CompanySettingsValues) {
    setFormError(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value ?? "");
    if (logo) formData.set("logo", logo);
    if (removeLogo) formData.set("removeLogo", "true");

    const result = await updateCompanySettings(formData);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    setLogo(null);
    setRemoveLogo(false);
    toast.success("Company settings saved");
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
          <CardTitle>Company</CardTitle>
          <CardDescription>Shown on quotations, invoices and emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {currentLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentLogo} alt="Company logo" className="size-full object-contain" />
              ) : (
                <Building2 className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={!canEdit}
                onChange={(e) => {
                  setLogo(e.target.files?.[0] ?? null);
                  setRemoveLogo(false);
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={!canEdit} onClick={() => fileInputRef.current?.click()}>
                {currentLogo ? "Change logo" : "Upload logo"}
              </Button>
              {currentLogo && canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLogo(null);
                    setRemoveLogo(true);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X />
                  Remove
                </Button>
              ) : null}
              <p className="w-full text-xs text-muted-foreground">PNG, JPG or WEBP, up to 2 MB. Used in the app and on PDFs.</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <FormField
                key={f.name}
                label={f.label}
                htmlFor={`company-${f.name}`}
                required={f.required}
                error={errors[f.name]?.message}
                className={f.wide ? "sm:col-span-2" : undefined}
              >
                {f.multiline ? (
                  <Textarea id={`company-${f.name}`} rows={3} disabled={!canEdit} {...form.register(f.name)} />
                ) : (
                  <Input id={`company-${f.name}`} type={f.type ?? "text"} disabled={!canEdit} {...form.register(f.name)} />
                )}
              </FormField>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>Printed on invoices so customers know where to pay.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {BANK_FIELDS.map((f) => (
            <FormField key={f.name} label={f.label} htmlFor={`company-${f.name}`} error={errors[f.name]?.message}>
              <Input id={`company-${f.name}`} disabled={!canEdit} {...form.register(f.name)} />
            </FormField>
          ))}
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
