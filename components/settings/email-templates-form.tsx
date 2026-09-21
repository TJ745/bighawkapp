"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { updateEmailTemplates } from "@/actions/settings";
import type { EmailTemplateRow } from "@/lib/data/settings";
import { EMAIL_PLACEHOLDERS, EMAIL_TEMPLATES } from "@/lib/settings/defaults";
import { emailTemplatesSchema, type EmailTemplatesInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

export function EmailTemplatesForm({ templates, canEdit }: { templates: EmailTemplateRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<EmailTemplatesInput>({
    resolver: zodResolver(emailTemplatesSchema),
    defaultValues: {
      templates: EMAIL_TEMPLATES.map((t) => {
        const row = templates.find((r) => r.key === t.key);
        return { key: t.key, subject: row?.subject ?? t.subject, body: row?.body ?? t.body };
      }),
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: EmailTemplatesInput) {
    setFormError(null);
    const result = await updateEmailTemplates(values);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    toast.success("Email templates saved");
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
          <CardTitle>Email templates</CardTitle>
          <CardDescription>
            Used when sending quotations, invoices and reminders. Placeholders in double braces are replaced automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Tabs defaultValue={EMAIL_TEMPLATES[0].key}>
            <TabsList className="h-auto flex-wrap">
              {EMAIL_TEMPLATES.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {EMAIL_TEMPLATES.map((t, index) => (
              <TabsContent key={t.key} value={t.key} className="space-y-5 pt-4">
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <FormField label="Subject" htmlFor={`tpl-${t.key}-subject`} required error={errors.templates?.[index]?.subject?.message}>
                  <Input id={`tpl-${t.key}-subject`} disabled={!canEdit} {...form.register(`templates.${index}.subject`)} />
                </FormField>
                <FormField label="Message" htmlFor={`tpl-${t.key}-body`} required error={errors.templates?.[index]?.body?.message}>
                  <Textarea id={`tpl-${t.key}-body`} rows={10} className="font-mono text-sm" disabled={!canEdit} {...form.register(`templates.${index}.body`)} />
                </FormField>
              </TabsContent>
            ))}
          </Tabs>
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="mb-2 text-sm font-medium">Available placeholders</p>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {EMAIL_PLACEHOLDERS.map((p) => (
                <li key={p.key} className="flex gap-2">
                  <code className="rounded bg-muted px-1 font-mono text-xs">{`{{${p.key}}}`}</code>
                  <span className="text-muted-foreground">{p.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
