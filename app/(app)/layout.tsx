import { cookies } from "next/headers";
import { after } from "next/server";
import { ActingAsBar } from "@/components/layout/acting-as-bar";
import { DemoBar } from "@/components/layout/demo-bar";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { FormatProvider } from "@/components/providers/format-provider";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAuth } from "@/lib/auth/session";
import { demoNotice, operatorContext } from "@/lib/data/companies";
import { countUnreadNotifications } from "@/lib/data/notifications";
import { getCurrentBranch, listActiveBranches } from "@/lib/data/platform";
import { getRegionalSettings } from "@/lib/data/settings";
import { runNotificationSweep } from "@/lib/notifications/sweep";
import { getBranding } from "@/lib/settings/branding";
import { posTypeInfo } from "@/lib/platform/pos-types";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireAuth();
  const posEnabled = auth.hasModule("POS");
  const [branding, regional, unreadCount, cookieStore, currentBranch, branches, operator, isDemo] = await Promise.all([
    getBranding(),
    getRegionalSettings(),
    countUnreadNotifications(auth.user.id),
    cookies(),
    getCurrentBranch(),
    posEnabled ? listActiveBranches() : Promise.resolve([]),
    // Only the operator belongs to no company, and only they can be looking at somebody else's.
    auth.user.isSuperAdmin ? operatorContext() : Promise.resolve(null),
    // Everybody in the demo company sees the banner, including whoever is watching the screen.
    demoNotice(),
  ]);
  // Industry capabilities of the branch in use decide which POS pages appear at all.
  const capabilities = posEnabled && currentBranch?.posConfig ? posTypeInfo(currentBranch.posConfig.businessType).capabilities : [];
  // Persist the collapsed/expanded state across reloads (cookie is set by the sidebar itself).
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Time-based notifications (overdue, due soon) run after the response, at most every 15 minutes.
  after(() => runNotificationSweep().catch((error) => console.error("[notifications] sweep failed", error)));

  return (
    <FormatProvider regional={regional}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar
          branding={branding}
          branches={branches.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
          currentBranchId={currentBranch?.id ?? null}
          visibleModules={auth.visibleModules}
          enabledModules={auth.enabledModules}
          capabilities={[...capabilities]}
        />
        <SidebarInset>
          <AppHeader>
            <NotificationBell unreadCount={unreadCount} />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
            <UserMenu user={auth.user} />
          </AppHeader>
          {isDemo ? <DemoBar canReset={auth.user.isSuperAdmin} /> : null}
          {operator ? <ActingAsBar context={operator} /> : null}
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 print:p-0">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </FormatProvider>
  );
}
