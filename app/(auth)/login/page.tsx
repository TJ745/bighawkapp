import type { Metadata } from "next";
import { FileText, FolderKanban, Lock, ShoppingCart } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { DEFAULT_COMPANY_ICON } from "@/components/layout/nav-config";
import { getBranding } from "@/lib/settings/branding";

export const metadata: Metadata = { title: "Sign in" };

function safeNextPath(value: string | undefined) {
  // Only allow same-origin relative paths to prevent open redirects.
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

// What the app actually does — kept in step with the modules that exist.
const HIGHLIGHTS = [
  { icon: FileText, label: "Quotations, invoices and payments" },
  { icon: ShoppingCart, label: "Suppliers, purchases and payables" },
  { icon: FolderKanban, label: "Projects, income, expenses and profit" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ next }, branding] = await Promise.all([searchParams, getBranding()]);
  const CompanyIcon = DEFAULT_COMPANY_ICON;
  const year = new Date().getFullYear();

  const logo = branding.logoUrl ? (
    // Plain <img>: the file route needs the session cookie, which the image optimizer would not send.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={branding.logoUrl} alt="" className="size-full object-contain" />
  ) : (
    <CompanyIcon className="size-5" />
  );

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      {/* Brand panel — desktop only; the mobile header below carries the same identity. */}
      <aside className="relative hidden shrink-0 flex-col justify-between bg-[#0f1b33] p-12 lg:flex lg:w-[46%] lg:max-w-xl xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground">{logo}</span>
          <span className="grid leading-tight">
            <span className="text-[17px] font-semibold tracking-tight text-white">{branding.companyName}</span>
            <span className="text-[13px] text-white/60">Business Management</span>
          </span>
        </div>

        <div className="relative space-y-8">
          <h2 className="max-w-md text-[2.35rem] leading-[1.15] font-semibold tracking-tight text-balance text-white">
            Run the whole business from one place.
          </h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.label} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80">
                  <item.icon className="size-[18px]" />
                </span>
                <span className="pt-1.5 text-[15px] text-white/75">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-white/45">
          © {year} {branding.companyName}
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:py-14">
        <div className="w-full max-w-[380px] space-y-7">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground">{logo}</span>
            <span className="grid leading-tight">
              <span className="font-semibold tracking-tight">{branding.companyName}</span>
              <span className="text-xs text-muted-foreground">Business Management</span>
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-[1.75rem] font-semibold tracking-tight">Sign in</h1>
            <p className="text-[15px] text-muted-foreground">Enter your details to continue.</p>
          </div>

          <LoginForm nextPath={safeNextPath(typeof next === "string" ? next : undefined)} />

          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            Accounts are created by your administrator.
          </p>
        </div>
      </main>
    </div>
  );
}
