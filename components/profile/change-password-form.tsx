"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { changeOwnPassword } from "@/actions/profile";
import { applyFieldErrors } from "@/lib/form-errors";
import { changePasswordSchema } from "@/lib/validation/profile";
import { describePasswordPolicy, type PasswordPolicy } from "@/lib/validation/users";

export function ChangePasswordForm({ passwordPolicy }: { passwordPolicy: PasswordPolicy }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = changePasswordSchema(passwordPolicy);
  type FormValues = { currentPassword: string; newPassword: string; confirmPassword: string };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const result = await changeOwnPassword(values);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Password changed. Other devices have been signed out.");
    form.reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>{describePasswordPolicy(passwordPolicy)} Changing it signs you out on other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FormField label="Current password" htmlFor="current-password" required error={errors.currentPassword?.message}>
            <Input id="current-password" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="New password" htmlFor="new-password" required error={errors.newPassword?.message}>
              <Input id="new-password" type="password" autoComplete="new-password" {...form.register("newPassword")} />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirm-password" required error={errors.confirmPassword?.message}>
              <Input id="confirm-password" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
            </FormField>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
