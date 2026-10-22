import type { ReactNode } from "react";
import { FileText, FolderKanban, ShoppingCart } from "lucide-react";
import { DEFAULT_COMPANY_ICON } from "@/components/layout/nav-config";
import { getBranding } from "@/lib/settings/branding";

// What the app actually does — kept in step with the modules that exist.
const HIGHLIGHTS = [
  { icon: FileText, label: "Quotations, invoices and payments" },
  { icon: ShoppingCart, label: "Suppliers, purchases and payables" },
  { icon: FolderKanban, label: "Projects, income, expenses and profit" },
];

/**
 * The frame every sign-in screen shares: brand panel on the left, a single column of form on the
 * right. Signing in, asking for a reset link and setting a new password are three steps of one
 * errand, so they are one layout rather than three that drift apart.
 */
export async function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const branding = await getBranding();
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
            <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
            <p className="text-[15px] text-muted-foreground">{subtitle}</p>
          </div>

          {children}

          {footer}
        </div>
      </main>
    </div>
  );
}
