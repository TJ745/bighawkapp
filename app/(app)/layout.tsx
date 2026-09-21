import { cookies } from "next/headers";
import { after } from "next/server";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { FormatProvider } from "@/components/providers/format-provider";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAuth } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/data/notifications";
import { getRegionalSettings } from "@/lib/data/settings";
import { runNotificationSweep } from "@/lib/notifications/sweep";
import { getBranding } from "@/lib/settings/branding";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireAuth();
  const [branding, regional, unreadCount, cookieStore] = await Promise.all([
    getBranding(),
    getRegionalSettings(),
    countUnreadNotifications(auth.user.id),
    cookies(),
  ]);
  // Persist the collapsed/expanded state across reloads (cookie is set by the sidebar itself).
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Time-based notifications (overdue, due soon) run after the response, at most every 15 minutes.
  after(() => runNotificationSweep().catch((error) => console.error("[notifications] sweep failed", error)));

  return (
    <FormatProvider regional={regional}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar branding={branding} visibleModules={auth.visibleModules} />
        <SidebarInset>
          <AppHeader>
            <NotificationBell unreadCount={unreadCount} />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
            <UserMenu user={auth.user} />
          </AppHeader>
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </FormatProvider>
  );
}
