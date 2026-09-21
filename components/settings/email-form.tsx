"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { sendTestEmail, updateEmailSettings, verifyEmailSettings } from "@/actions/settings";
import type { EmailSettingsView } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { emailSettingsSchema, type EmailSettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";
import { SettingSwitchRow } from "./setting-switch-row";

export function EmailForm({ settings, adminEmail }: { settings: EmailSettingsView; adminEmail: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(adminEmail);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  const form = useForm<EmailSettingsInput>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      password: "",
      clearPassword: false,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      replyTo: settings.replyTo,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [secure, clearPassword] = useWatch({ control: form.control, name: ["secure", "clearPassword"] });

  async function onSubmit(values: EmailSettingsInput) {
    setFormError(null);
    const result = await updateEmailSettings(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Email settings saved");
    form.setValue("password", "");
    form.setValue("clearPassword", false);
    router.refresh();
  }

  // Both checks run against what is saved, not what is typed — so save first, then test.
  async function check() {
    setChecking(true);
    try {
      const result = await verifyEmailSettings();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("The mail server accepted these settings.");
    } finally {
      setChecking(false);
    }
  }

  async function test() {
    setSending(true);
    try {
      const result = await sendTestEmail({ to: testTo });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Test email sent to ${testTo}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Mail server (SMTP)</CardTitle>
            <CardDescription>
              Where quotations, invoices and notification emails are sent from. Your email provider supplies these details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Host" htmlFor="smtp-host" error={errors.host?.message} description="e.g. smtp.gmail.com">
                <Input id="smtp-host" autoComplete="off" {...form.register("host")} />
              </FormField>
              <FormField label="Port" htmlFor="smtp-port" error={errors.port?.message} description="587 for STARTTLS, 465 for SSL">
                <Input id="smtp-port" type="number" inputMode="numeric" {...form.register("port")} />
              </FormField>
              <FormField label="Username" htmlFor="smtp-user" error={errors.username?.message} description="Leave blank if the server does not need a login">
                <Input id="smtp-user" autoComplete="off" {...form.register("username")} />
              </FormField>
              <FormField
                label="Password"
                htmlFor="smtp-pass"
                error={errors.password?.message}
                description={settings.hasPassword ? "A password is saved. Leave blank to keep it." : "Stored securely and never shown again."}
              >
                <Input id="smtp-pass" type="password" autoComplete="new-password" disabled={clearPassword === true} {...form.register("password")} />
              </FormField>
            </div>

            <SettingSwitchRow
              label="Use SSL/TLS on connect"
              description="On for port 465. Leave off for 587, which upgrades to TLS after connecting."
              checked={secure === true}
              onCheckedChange={(v) => form.setValue("secure", v, { shouldDirty: true })}
            />
            {settings.hasPassword ? (
              <SettingSwitchRow
                label="Remove the saved password"
                description="Use this when the server stops needing a login."
                checked={clearPassword === true}
                onCheckedChange={(v) => form.setValue("clearPassword", v, { shouldDirty: true })}
              />
            ) : null}
          </CardContent>
          <SettingsFormFooter saving={isSubmitting} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sender</CardTitle>
            <CardDescription>How your emails appear in the recipient&apos;s inbox.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField label="From address" htmlFor="smtp-from" error={errors.fromEmail?.message} description="Must be an address the mail server may send from">
              <Input id="smtp-from" type="email" autoComplete="off" {...form.register("fromEmail")} />
            </FormField>
            <FormField label="From name" htmlFor="smtp-from-name" error={errors.fromName?.message} description="Defaults to the company name in Settings → Company">
              <Input id="smtp-from-name" autoComplete="off" {...form.register("fromName")} />
            </FormField>
            <FormField label="Reply-to address" htmlFor="smtp-reply" error={errors.replyTo?.message} description="Optional — where replies should go instead" className="sm:col-span-2">
              <Input id="smtp-reply" type="email" autoComplete="off" {...form.register("replyTo")} />
            </FormField>
          </CardContent>
          <SettingsFormFooter saving={isSubmitting} />
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Test</CardTitle>
          <CardDescription>Both checks use the saved settings, so save your changes first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings.host || !settings.fromEmail ? (
            <Alert>
              <AlertDescription>Email is not configured yet. Documents can still be downloaded and printed, but nothing can be sent.</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField label="Send a test email to" htmlFor="smtp-test-to" className="flex-1">
              <Input id="smtp-test-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@company.com" />
            </FormField>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={check} disabled={checking}>
                {checking ? <Loader2 className="animate-spin" /> : <MailCheck />}
                Check connection
              </Button>
              <Button type="button" onClick={test} disabled={sending || !testTo}>
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                Send test
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
