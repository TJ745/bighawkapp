"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type LinkTab = { label: string; href: string; exact?: boolean };

// URL-driven tabs (each tab is a route) so tab content can be a Server Component.
export function LinkTabs({ tabs, className }: { tabs: LinkTab[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex gap-1 overflow-x-auto border-b", className)} aria-label="Sections">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
