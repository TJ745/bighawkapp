import { z } from "zod";
import { PosKitchenStatus } from "@/lib/generated/prisma/enums";

export const sendToKitchenSchema = z.object({
  saleId: z.string().min(1),
  note: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const advanceTicketSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(PosKitchenStatus),
});

/** What each stage is called on screen, and the tone its card takes. */
export const KITCHEN_STATUS_LABELS = {
  NEW: { label: "New", tone: "info" },
  PREPARING: { label: "Preparing", tone: "warning" },
  READY: { label: "Ready", tone: "success" },
  SERVED: { label: "Served", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
} as const;

/** The button that moves a ticket on, worded the way a cook would say it. */
export const KITCHEN_ACTION_LABELS: Record<keyof typeof KITCHEN_STATUS_LABELS, string> = {
  NEW: "Start",
  PREPARING: "Start",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancel",
};
