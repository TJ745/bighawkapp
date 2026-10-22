import { z } from "zod";
import { AppointmentStatus } from "@/lib/generated/prisma/enums";
import { createSaleSchema } from "./pos";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const staffSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: optionalText(40),
  userId: optionalText(60),
  commissionPercent: z.coerce.number({ error: "Enter a percentage" }).min(0, "0–100").max(100, "0–100").default(0),
  colour: optionalText(20),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

export const appointmentItemSchema = z.object({
  variantId: z.string().min(1, "Choose a service"),
  /** Blank keeps the catalogue duration and price; both are re-read server-side. */
  durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(600, "At most 10 hours").optional(),
  staffId: optionalText(60),
});

export const appointmentSchema = z.object({
  customerId: optionalText(60),
  customerName: z.string().trim().min(1, "Who is the booking for?").max(120),
  customerPhone: optionalText(40),
  staffId: z.string().min(1, "Choose who is doing it"),
  /** Local date and time as the form sends them: "2026-10-12" and "14:30". */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
  note: optionalText(500),
  items: z.array(appointmentItemSchema).min(1, "Add at least one service"),
});

/** Paying for a booking at the till: an ordinary sale that also closes the booking. */
export const payAppointmentSchema = createSaleSchema.extend({ appointmentId: z.string().min(1) });

export const appointmentStatusSchema = z.object({
  appointmentId: z.string().min(1),
  status: z.enum(AppointmentStatus),
});

export const APPOINTMENT_STATUS_LABELS = {
  BOOKED: { label: "Booked", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  ARRIVED: { label: "Arrived", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  NO_SHOW: { label: "No show", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

export type StaffInput = z.input<typeof staffSchema>;
export type AppointmentInput = z.input<typeof appointmentSchema>;
