import { z } from "zod";
import { PermissionModule } from "@/lib/generated/prisma/enums";

export type PasswordPolicy = { minLength: number; requireNumber: boolean; requireUppercase: boolean };

// Secure default until Settings → Security overrides it.
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { minLength: 8, requireNumber: true, requireUppercase: false };

export function passwordSchema(policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY) {
  let schema = z.string().min(policy.minLength, `Password must be at least ${policy.minLength} characters`);
  if (policy.requireNumber) schema = schema.regex(/\d/, "Password must include a number");
  if (policy.requireUppercase) schema = schema.regex(/[A-Z]/, "Password must include an uppercase letter");
  return schema;
}

const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? v : null));

const userBase = {
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  phone: optionalText,
  roleId: z.string().trim().min(1, "Role is required"),
  isActive: z.coerce.boolean().default(true),
};

export const createUserSchema = (policy: PasswordPolicy) =>
  z.object({
    ...userBase,
    password: passwordSchema(policy),
  });

export const updateUserSchema = (policy: PasswordPolicy) =>
  z.object({
    ...userBase,
    // Leave blank to keep the current password.
    password: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(passwordSchema(policy).optional()),
  });

export function describePasswordPolicy(policy: PasswordPolicy) {
  const extras: string[] = [];
  if (policy.requireNumber) extras.push("a number");
  if (policy.requireUppercase) extras.push("an uppercase letter");
  return `At least ${policy.minLength} characters${extras.length ? `, including ${extras.join(" and ")}` : ""}.`;
}

// --- Roles -------------------------------------------------------------------

const permissionRow = z.object({
  module: z.enum(PermissionModule),
  view: z.boolean(),
  create: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

export const roleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(60),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
  permissions: z.array(permissionRow),
});

export type RoleFormValues = z.input<typeof roleSchema>;
export type RoleInput = z.output<typeof roleSchema>;
export type PermissionRowInput = z.output<typeof permissionRow>;
