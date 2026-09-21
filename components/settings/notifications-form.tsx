"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField } from "@/components/shared/form-field";
import { updateNotificationSettings } from "@/actions/settings";
import type { AppSettings, NotificationSettingRow } from "@/lib/data/settings";
import { NOTIFICATION_TYPES } from "@/lib/settings/defaults";
import { notificationSettingsSchema, type NotificationSettingsInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

type UserOption = { id: string; name: string; email: string };

type Props = {
  settings: AppSettings;
  items: NotificationSettingRow[];
  users: UserOption[];
  canEdit: boolean;
};

export function NotificationsForm({ settings, items, users, canEdit }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NotificationSettingsInput>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues: {
      invoiceDueSoonDays: settings.invoiceDueSoonDays,
      items: NOTIFICATION_TYPES.map((n) => {
        const row = items.find((i) => i.type === n.type);
        return {
          type: n.type,
          enabled: row?.enabled ?? true,
          inApp: row?.inApp ?? true,
          email: row?.email ?? false,
          recipientUserIds: row?.recipientUserIds ?? [],
        };
      }),
    },
  });
  const { errors, isSubmitting } = form.formState;
  const rows = useWatch({ control: form.control, name: "items" });

  function setField(index: number, field: "enabled" | "inApp" | "email", value: boolean) {
    form.setValue(`items.${index}.${field}`, value, { shouldDirty: true });
  }

  function toggleRecipient(index: number, userId: string, checked: boolean) {
    const current = rows?.[index]?.recipientUserIds ?? [];
    const next = checked ? [...new Set([...current, userId])] : current.filter((id) => id !== userId);
    form.setValue(`items.${index}.recipientUserIds`, next, { shouldDirty: true });
  }

  async function onSubmit(values: NotificationSettingsInput) {
    setFormError(null);
    const result = await updateNotificationSettings(values);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    toast.success("Notification settings saved");
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
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose which events notify people, in the app and/or by email, and who receives them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormField
            label="“Due soon” warning (days before due date)"
            htmlFor="due-soon-days"
            error={errors.invoiceDueSoonDays?.message}
            className="max-w-xs"
          >
            <Input id="due-soon-days" type="number" min={1} max={60} disabled={!canEdit} {...form.register("invoiceDueSoonDays")} />
          </FormField>

          <div className="-mx-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Event</TableHead>
                  <TableHead className="w-24 text-center">Enabled</TableHead>
                  <TableHead className="w-24 text-center">In app</TableHead>
                  <TableHead className="w-24 text-center">Email</TableHead>
                  <TableHead className="pr-6">Recipients</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NOTIFICATION_TYPES.map((n, index) => {
                  const row = rows?.[index];
                  const enabled = Boolean(row?.enabled);
                  const recipients = row?.recipientUserIds ?? [];
                  const recipientLabel =
                    recipients.length === 0
                      ? "All users with access"
                      : recipients.length === 1
                        ? (users.find((u) => u.id === recipients[0])?.name ?? "1 user")
                        : `${recipients.length} users`;
                  return (
                    <TableRow key={n.type}>
                      <TableCell className="pl-6">
                        <p className="font-medium">{n.label}</p>
                        <p className="text-xs text-muted-foreground">{n.description}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch aria-label={`${n.label} enabled`} checked={enabled} disabled={!canEdit} onCheckedChange={(v) => setField(index, "enabled", v)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          aria-label={`${n.label} in app`}
                          checked={Boolean(row?.inApp)}
                          disabled={!canEdit || !enabled}
                          onCheckedChange={(v) => setField(index, "inApp", v === true)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          aria-label={`${n.label} email`}
                          checked={Boolean(row?.email)}
                          disabled={!canEdit || !enabled}
                          onCheckedChange={(v) => setField(index, "email", v === true)}
                        />
                      </TableCell>
                      <TableCell className="pr-6">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="sm" disabled={!canEdit || !enabled} className="max-w-48 justify-between">
                              <span className="truncate">{recipientLabel}</span>
                              <ChevronDown className="opacity-60" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 p-2">
                            <p className="px-2 pb-2 text-xs text-muted-foreground">
                              Leave everyone unchecked to notify all users who can see the related module.
                            </p>
                            <div className="max-h-56 space-y-1 overflow-y-auto">
                              {users.map((u) => (
                                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                                  <Checkbox checked={recipients.includes(u.id)} onCheckedChange={(v) => toggleRecipient(index, u.id, v === true)} />
                                  <span className="truncate">{u.name}</span>
                                </label>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
