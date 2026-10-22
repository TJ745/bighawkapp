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
import { CompanyMenu, type BranchOption } from "./company-menu";
import { visibleNavItems, type NavItem } from "./nav-config";
import type { AppModule, PermissionModule } from "@/lib/generated/prisma/enums";
import type { PosCapability } from "@/lib/platform/pos-types";

type AppSidebarProps = {
  branding: { companyName: string; logoUrl: string | null };
  /** Active branches of this company; empty when POS is off. The company block chooses between them. */
  branches: BranchOption[];
  currentBranchId: string | null;
  // Permission modules the current user may view.
  visibleModules: PermissionModule[];
  // Product modules the company subscribes to, and the industry capabilities of the current branch.
  enabledModules: AppModule[];
  capabilities: PosCapability[];
};

// Hover stays neutral; only the current page wears the brand tint, so the two never look alike.
const ITEM_CLASSES =
  "h-9 gap-3 rounded-lg font-medium text-sidebar-foreground/80 transition-colors hover:bg-muted hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-accent-foreground [&_svg]:size-[18px]";

const SUB_CLASSES =
  "h-8 rounded-md text-sidebar-foreground/70 transition-colors hover:bg-muted hover:text-sidebar-foreground data-active:bg-transparent data-active:font-medium data-active:text-sidebar-accent-foreground";

function isItemActive(item: NavItem, pathname: string) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppSidebar({ branding, branches, currentBranchId, visibleModules, enabledModules, capabilities }: AppSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const items = visibleNavItems({ visibleModules, enabledModules, capabilities });
  const closeOnMobile = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3 group-data-[collapsible=icon]:p-2">
        {/* The company, and the branch being worked in — branches belong to a company. */}
        <CompanyMenu branding={branding} branches={branches} currentBranchId={currentBranchId} onNavigate={closeOnMobile} />
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
