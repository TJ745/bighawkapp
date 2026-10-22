import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { isEmailConfigured } from "@/lib/email/mailer";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  /**
   * Without SMTP there is nothing this page can do, and the sign-in screen does not link to it.
   * Reaching it directly should therefore look like what it is: a page that is not there.
   */
  if (!(await isEmailConfigured())) notFound();

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email address and we will send you a link to set a new one.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
