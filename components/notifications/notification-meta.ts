import { AlertTriangle, Bell, CalendarClock, FileCheck2, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import type { StatusTone } from "@/components/shared/status-badge";
import type { NotificationType } from "@/lib/generated/prisma/enums";
import { NOTIFICATION_TYPES } from "@/lib/settings/defaults";

// Icon + tone for each notification type, so the bell and the centre read the same way.
const META: Record<NotificationType, { icon: LucideIcon; tone: StatusTone }> = {
  INVOICE_OVERDUE: { icon: AlertTriangle, tone: "danger" },
  INVOICE_DUE_SOON: { icon: CalendarClock, tone: "warning" },
  SUPPLIER_PAYMENT_DUE: { icon: CalendarClock, tone: "warning" },
  CUSTOMER_PAYMENT_RECEIVED: { icon: Wallet, tone: "success" },
  QUOTATION_ACCEPTED: { icon: FileCheck2, tone: "info" },
  NEW_USER_CREATED: { icon: UserPlus, tone: "purple" },
};

const TILE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-tint-blue text-tint-blue-foreground",
  success: "bg-tint-green text-tint-green-foreground",
  warning: "bg-tint-amber text-tint-amber-foreground",
  danger: "bg-tint-red text-tint-red-foreground",
  purple: "bg-tint-purple text-tint-purple-foreground",
};

export function notificationMeta(type: NotificationType) {
  const meta = META[type] ?? { icon: Bell, tone: "neutral" as StatusTone };
  return {
    ...meta,
    label: NOTIFICATION_TYPES.find((t) => t.type === type)?.label ?? type,
    tileClassName: TILE_CLASSES[meta.tone],
  };
}
