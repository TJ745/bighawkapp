"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// superAdminOnly sections are hidden from everyone else; their pages and actions check again.
export const SETTINGS_SECTIONS: { label: string; href: string; superAdminOnly?: boolean }[] = [
  { label: "Company", href: "/settings/company" },
  { label: "Document Numbering", href: "/settings/numbering" },
  { label: "VAT", href: "/settings/vat" },
  { label: "Payment Terms", href: "/settings/payment-terms" },
  { label: "Payment Accounts", href: "/settings/accounts" },
  { label: "Notifications", href: "/settings/notifications" },
  { label: "Date & Regional", href: "/settings/regional" },
  { label: "Document & Email Styling", href: "/settings/styling", superAdminOnly: true },
  { label: "Email (SMTP)", href: "/settings/email", superAdminOnly: true },
  { label: "Security", href: "/settings/security", superAdminOnly: true },
];

// Vertical section list on desktop, horizontally scrollable pills on small screens.
export function SettingsNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const sections = SETTINGS_SECTIONS.filter((section) => !section.superAdminOnly || isSuperAdmin);
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:w-56 md:shrink-0 md:overflow-visible md:px-0">
      <ul className="flex gap-1 md:flex-col">
        {sections.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
