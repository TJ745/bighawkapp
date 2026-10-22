import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { isEmailConfigured } from "@/lib/email/mailer";

export const metadata: Metadata = { title: "Sign in" };

function safeNextPath(value: string | undefined) {
  // Only allow same-origin relative paths to prevent open redirects.
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Without SMTP a reset link cannot be delivered, so the offer is not made — better than a dead
  // end. Only a boolean is read here; this page is public.
  const [{ next }, canReset] = await Promise.all([searchParams, isEmailConfigured()]);

  return (
    <AuthShell
      title="Sign in"
      subtitle="Enter your details to continue."
      footer={
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          Accounts are created by your administrator.
        </p>
      }
    >
      <LoginForm nextPath={safeNextPath(typeof next === "string" ? next : undefined)} canReset={canReset} />
    </AuthShell>
  );
}
