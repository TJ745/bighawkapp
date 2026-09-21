import { z } from "zod";
import { ProjectStatus, ProjectType } from "@/lib/generated/prisma/enums";
import type { StatusTone } from "@/components/shared/status-badge";
import { dateOnlySchema } from "./sales";

export const projectSchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  name: z.string().trim().min(1, "Project name is required").max(200),
  type: z.enum(ProjectType),
  startDate: dateOnlySchema,
  expectedCompletionDate: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(dateOnlySchema.nullable()),
  value: z.coerce.number({ error: "Enter the project value" }).min(0, "Value cannot be negative").max(1_000_000_000),
  status: z.enum(ProjectStatus),
  notes: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((v) => (v ? v : null)),
});

export type ProjectFormValues = z.input<typeof projectSchema>;
export type ProjectValues = z.output<typeof projectSchema>;

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "IT_INFRASTRUCTURE", label: "IT Infrastructure" },
  { value: "SOFTWARE_DEVELOPMENT", label: "Software Development" },
  { value: "OTHER", label: "Other" },
];

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: StatusTone }> = {
  NOT_STARTED: { label: "Not Started", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  ON_HOLD: { label: "On Hold", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const PROJECT_FILTERS = [
  { value: "all", label: "All" },
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on-hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
];

export function projectTypeLabel(type: ProjectType) {
  return PROJECT_TYPES.find((t) => t.value === type)?.label ?? type;
}
