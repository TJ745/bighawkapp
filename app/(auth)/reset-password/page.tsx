import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getPasswordPolicy } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const [{ token }, policy] = await Promise.all([searchParams, getPasswordPolicy()]);
  const resetToken = typeof token === "string" ? token : "";

  /**
   * The token is not checked here, only its presence. Whether it is still good is decided when it
   * is spent, in one step — looking first and using later would be two answers that can disagree,
   * and would turn this page into a way of testing tokens.
   */
  if (!resetToken) {
    return (
      <AuthShell title="This link is not complete" subtitle="The reset link was missing its token, which usually means it was cut short by an email client.">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Open the link from your email again, or ask for a new one.</AlertDescription>
        </Alert>
        <div className="space-y-2">
          <Button asChild className="h-11 w-full">
            <Link href="/forgot-password">Ask for a new link</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a new password for your account. You will be signed out everywhere else.">
      <ResetPasswordForm token={resetToken} policy={policy} />
    </AuthShell>
  );
}
