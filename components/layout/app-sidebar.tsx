"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY_ICON, NAV_ITEMS, type NavItem } from "./nav-config";
import type { PermissionModule } from "@/lib/generated/prisma/enums";

type AppSidebarProps = {
  branding: { companyName: string; logoUrl: string | null };
  // Modules the current user may view. `null` means unrestricted (Super Admin / Admin).
  visibleModules: PermissionModule[] | null;
};

// Hover stays neutral; only the current page wears the brand tint, so the two never look alike.
const ITEM_CLASSES =
  "h-9 gap-3 rounded-lg font-medium text-sidebar-foreground/80 transition-colors hover:bg-muted hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-accent-foreground [&_svg]:size-[18px]";

const SUB_CLASSES =
  "h-8 rounded-md text-sidebar-foreground/70 transition-colors hover:bg-muted hover:text-sidebar-foreground data-active:bg-transparent data-active:font-medium data-active:text-sidebar-accent-foreground";

function isItemActive(item: NavItem, pathname: string) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppSidebar({ branding, visibleModules }: AppSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const CompanyIcon = DEFAULT_COMPANY_ICON;

  const items = NAV_ITEMS.filter((item) => !item.module || visibleModules === null || visibleModules.includes(item.module));
  const closeOnMobile = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3 group-data-[collapsible=icon]:p-2">
        {/* Brand block: a quiet mark, never a coloured wash behind an uploaded logo. */}
        <Link
          href="/dashboard"
          onClick={closeOnMobile}
          className="flex items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-muted group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        >
          {branding.logoUrl ? (
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card p-1 group-data-[collapsible=icon]:size-8">
              {/* Plain <img>: the file route needs the session cookie, which the image optimizer would not send. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={branding.logoUrl} alt="" className="size-full object-contain" />
            </span>
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:size-8">
              <CompanyIcon className="size-[18px]" />
            </span>
          )}
          <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold tracking-tight">{branding.companyName}</span>
            <span className="truncate text-xs text-muted-foreground">Business Management</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => {
                const active = isItemActive(item, pathname);
                if (!item.children) {
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={ITEM_CLASSES}>
                        <Link href={item.href} onClick={closeOnMobile}>
                          <item.icon className={active ? undefined : "text-muted-foreground"} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                return <NavSection key={item.href} item={item} pathname={pathname} active={active} onNavigate={closeOnMobile} />;
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

/** A section that expands to show its pages; open by default while you are inside it. */
function NavSection({ item, pathname, active, onNavigate }: { item: NavItem; pathname: string; active: boolean; onNavigate: () => void }) {
  const { state, isMobile } = useSidebar();
  const [open, setOpen] = useState(active);
  const iconOnly = state === "collapsed" && !isMobile;
  // Opening a page inside the section from elsewhere (search, a link) expands it too.
  const expanded = open || active;

  // Collapsed to icons: the sub-menu cannot show, so the row is a link to the section instead.
  if (iconOnly) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={ITEM_CLASSES}>
          <Link href={item.href} onClick={onNavigate}>
            <item.icon className={active ? undefined : "text-muted-foreground"} />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={expanded} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={active} tooltip={item.title} className={ITEM_CLASSES}>
            <item.icon className={active ? undefined : "text-muted-foreground"} />
            <span>{item.title}</span>
            <ChevronRight
              className={cn(
                "ml-auto text-muted-foreground transition-transform duration-200 group-data-[collapsible=icon]:hidden",
                expanded && "rotate-90",
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mr-0 gap-0.5 pr-0">
            {item.children?.map((child) => {
              const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton asChild isActive={childActive} className={SUB_CLASSES}>
                    <Link href={child.href} onClick={onNavigate}>
                      <span>{child.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
