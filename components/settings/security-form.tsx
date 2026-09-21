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
import { FormField } from "@/components/shared/form-field";
import { updateSecuritySettings } from "@/actions/settings";
import type { AppSettings } from "@/lib/data/settings";
import { applyFieldErrors } from "@/lib/form-errors";
import { SESSION_TIMEOUT_OPTIONS } from "@/lib/settings/defaults";
import { securitySettingsSchema, type SecuritySettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";
import { SettingSwitchRow } from "./setting-switch-row";

export function SecurityForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SecuritySettingsInput>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      passwordMinLength: settings.passwordMinLength,
      passwordRequireNumber: settings.passwordRequireNumber,
      passwordRequireUppercase: settings.passwordRequireUppercase,
      maxLoginAttempts: settings.maxLoginAttempts,
      lockoutMinutes: settings.lockoutMinutes,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [timeout, requireNumber, requireUppercase] = useWatch({
    control: form.control,
    name: ["sessionTimeoutMinutes", "passwordRequireNumber", "passwordRequireUppercase"],
  });

  async function onSubmit(values: SecuritySettingsInput) {
    setFormError(null);
    const result = await updateSecuritySettings(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Security settings saved");
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
          <CardTitle>Session</CardTitle>
          <CardDescription>Users are signed out automatically after this period of inactivity.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Session timeout" htmlFor="session-timeout" required error={errors.sessionTimeoutMinutes?.message} className="max-w-xs">
            <Select
              value={String(timeout)}
              disabled={!canEdit}
              onValueChange={(v) => form.setValue("sessionTimeoutMinutes", Number(v), { shouldDirty: true })}
            >
              <SelectTrigger id="session-timeout" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_TIMEOUT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password policy</CardTitle>
          <CardDescription>Applies when creating users or setting new passwords. Passwords are always stored hashed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FormField label="Minimum length" htmlFor="password-min" required error={errors.passwordMinLength?.message} className="max-w-xs">
            <Input id="password-min" type="number" min={6} max={64} disabled={!canEdit} {...form.register("passwordMinLength")} />
          </FormField>
          <SettingSwitchRow
            label="Require a number"
            checked={Boolean(requireNumber)}
            disabled={!canEdit}
            onCheckedChange={(v) => form.setValue("passwordRequireNumber", v, { shouldDirty: true })}
          />
          <SettingSwitchRow
            label="Require an uppercase letter"
            checked={Boolean(requireUppercase)}
            disabled={!canEdit}
            onCheckedChange={(v) => form.setValue("passwordRequireUppercase", v, { shouldDirty: true })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login security</CardTitle>
          <CardDescription>Accounts are temporarily locked after repeated failed sign-in attempts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label="Failed attempts before lockout" htmlFor="max-attempts" required error={errors.maxLoginAttempts?.message}>
            <Input id="max-attempts" type="number" min={3} max={20} disabled={!canEdit} {...form.register("maxLoginAttempts")} />
          </FormField>
          <FormField label="Lockout duration (minutes)" htmlFor="lockout-minutes" required error={errors.lockoutMinutes?.message}>
            <Input id="lockout-minutes" type="number" min={1} max={1440} disabled={!canEdit} {...form.register("lockoutMinutes")} />
          </FormField>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
