"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { completePasswordReset } from "@/actions/auth";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { describePasswordPolicy, type PasswordPolicy } from "@/lib/validation/users";

/**
 * Setting a new password from a reset link.
 *
 * The policy is shown before anything is typed, rather than only as an error afterwards, and the
 * same policy is re-applied by the action — the rules here are a courtesy, not the check.
 */
export function ResetPasswordForm({ token, policy }: { token: string; policy: PasswordPolicy }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema(policy)),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);
    const result = await completePasswordReset(values);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    toast.success("Your password has been changed. Please sign in.");
    // Other sessions were signed out by the reset, so the sign-in screen is the only way on.
    router.replace("/login");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {formError}
            <Link href="/forgot-password" className="ml-1 underline">
              Ask for a new link
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" {...form.register("token")} />
      <FormField label="New password" htmlFor="password" required description={describePasswordPolicy(policy)} error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" autoFocus className="h-11" {...form.register("password")} />
      </FormField>
      <FormField label="Confirm new password" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" className="h-11" {...form.register("confirmPassword")} />
      </FormField>
      <Button type="submit" size="lg" className="mt-2 h-12 w-full text-[15px]" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Change password
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
