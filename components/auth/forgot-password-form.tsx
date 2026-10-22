"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { requestPasswordReset } from "@/actions/auth";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";

/**
 * Asking for a reset link.
 *
 * On success the form is replaced by the confirmation rather than showing a toast over an empty
 * form: the next step happens in the person's inbox, so the screen should say so and stop inviting
 * them to type. The wording never confirms whether the address has an account.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ForgotPasswordInput) {
    setFormError(null);
    const result = await requestPasswordReset(values);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    setSent(result.data.message);
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <Alert>
          <MailCheck className="text-tint-green-foreground" />
          <AlertDescription>{sent}</AlertDescription>
        </Alert>
        <p className="text-[13px] text-muted-foreground">
          The link lasts one hour and can only be used once. If nothing arrives, check your spam folder or ask your administrator.
        </p>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">
            <ArrowLeft />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@company.com" className="h-11" {...form.register("email")} />
      </FormField>
      <Button type="submit" size="lg" className="mt-2 h-12 w-full text-[15px]" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Send reset link
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">
          <ArrowLeft />
          Back to sign in
        </Link>
      </Button>
    </form>
  );
}
