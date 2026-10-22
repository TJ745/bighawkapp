import { z } from "zod";
import { RentalStatus, StayStatus, WorkOrderStatus } from "@/lib/generated/prisma/enums";
import { createSaleSchema } from "./pos";

/** Shared shapes for the four advanced industries: repair, tickets, rooms and rentals. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const money = (message = "Enter an amount") => z.coerce.number({ error: message }).min(0, "Cannot be negative").max(99_999_999, "Too large");

const optionalMoney = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.union([z.null(), money("Enter an amount")]));

const dateOnly = (message: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);

// --- Work orders --------------------------------------------------------------

export const workOrderSchema = z.object({
  customerId: optionalText(60),
  customerName: z.string().trim().min(1, "Who is it for?").max(120),
  customerPhone: optionalText(40),
  itemName: z.string().trim().min(1, "What was brought in?").max(160),
  serialNumber: optionalText(80),
  faultReported: z.string().trim().min(1, "What is wrong with it?").max(500),
  staffId: optionalText(60),
  promisedDate: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  note: optionalText(500),
});

export const workOrderDetailsSchema = z.object({
  workOrderId: z.string().min(1),
  diagnosis: optionalText(1000),
  estimate: optionalMoney,
  staffId: optionalText(60),
  promisedDate: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  note: optionalText(500),
});

export const workOrderStatusSchema = z.object({
  workOrderId: z.string().min(1),
  status: z.enum(WorkOrderStatus),
});

/** Paying for a job: an ordinary sale that also marks the job paid. */
export const payWorkOrderSchema = createSaleSchema.extend({ workOrderId: z.string().min(1) });

export const WORK_ORDER_STATUS_LABELS = {
  RECEIVED: { label: "Received", tone: "info" },
  DIAGNOSING: { label: "Being looked at", tone: "info" },
  QUOTED: { label: "Quoted", tone: "warning" },
  APPROVED: { label: "Approved", tone: "warning" },
  IN_PROGRESS: { label: "Being repaired", tone: "warning" },
  READY: { label: "Ready", tone: "success" },
  DELIVERED: { label: "Handed back", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
} as const;

// --- Tickets ------------------------------------------------------------------

export const ticketEventSchema = z.object({
  name: z.string().trim().min(1, "Give the event a name").max(120),
  variantId: z.string().min(1, "Choose the ticket item"),
  date: dateOnly("Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
  endTime: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null)),
  capacity: z.coerce.number({ error: "How many places?" }).int("Whole places only").min(1, "At least one place").max(100_000, "That is a lot of places"),
  note: optionalText(300),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

// --- Rooms --------------------------------------------------------------------

export const roomSchema = z.object({
  name: z.string().trim().min(1, "Room name is required").max(40),
  roomType: optionalText(60),
  capacity: z.coerce.number({ error: "How many does it sleep?" }).int("Whole people only").min(1, "At least 1").max(20, "At most 20"),
  nightlyRate: money("Enter the nightly rate").default(0),
  variantId: optionalText(60),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

export const staySchema = z
  .object({
    roomId: z.string().min(1, "Choose a room"),
    customerId: optionalText(60),
    guestName: z.string().trim().min(1, "Who is staying?").max(120),
    guestPhone: optionalText(40),
    checkIn: dateOnly("Choose the arrival date"),
    checkOut: dateOnly("Choose the departure date"),
    guests: z.coerce.number({ error: "How many guests?" }).int("Whole people only").min(1, "At least 1").max(20, "At most 20").default(1),
    nightlyRate: optionalMoney,
    note: optionalText(500),
  })
  .refine((value) => value.checkOut >= value.checkIn, { message: "Departure cannot be before arrival", path: ["checkOut"] });

export const stayStatusSchema = z.object({
  stayId: z.string().min(1),
  status: z.enum(StayStatus),
});

/** Charging something to a room: the folio is re-priced server-side like any other held bill. */
export const chargeFolioSchema = z.object({
  stayId: z.string().min(1),
  /** Adds the room's own nights line, where the room has an item to charge it with. */
  includeNights: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  lines: z.array(createSaleSchema.shape.lines.element).default([]),
});

export const checkOutSchema = z.object({
  stayId: z.string().min(1),
  registerId: optionalText(60),
  payments: createSaleSchema.shape.payments,
});

export const STAY_STATUS_LABELS = {
  BOOKED: { label: "Booked", tone: "info" },
  CHECKED_IN: { label: "Checked in", tone: "warning" },
  CHECKED_OUT: { label: "Checked out", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No show", tone: "danger" },
} as const;

// --- Rentals ------------------------------------------------------------------

export const rentalSchema = z.object({
  customerId: optionalText(60),
  customerName: z.string().trim().min(1, "Who is taking it?").max(120),
  customerPhone: optionalText(40),
  variantId: z.string().min(1, "Choose the item"),
  quantity: z.coerce.number({ error: "How many?" }).positive("Must be more than 0").max(9_999),
  days: z.coerce.number({ error: "For how many days?" }).int("Whole days only").min(1, "At least a day").max(365, "At most a year"),
  dailyRate: optionalMoney,
  deposit: money("Enter the deposit").default(0),
  note: optionalText(500),
});

export const returnRentalSchema = z.object({
  rentalId: z.string().min(1),
  /** Not coming back: charged for and written off instead of restocked. */
  lost: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

export const RENTAL_STATUS_LABELS = {
  OUT: { label: "Out", tone: "info" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  RETURNED: { label: "Back", tone: "success" },
  LOST: { label: "Lost", tone: "neutral" },
} as const;

export type WorkOrderInput = z.input<typeof workOrderSchema>;
export type TicketEventInput = z.input<typeof ticketEventSchema>;
export type RoomInput = z.input<typeof roomSchema>;
export type StayInput = z.input<typeof staySchema>;
export type RentalInput = z.input<typeof rentalSchema>;
export type RentalStatusKey = keyof typeof RENTAL_STATUS_LABELS;
export type { RentalStatus };
