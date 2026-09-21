import { z } from "zod";
import { passwordSchema, type PasswordPolicy } from "./users";

// What a signed-in user may change about themselves. Email, role and status stay with administrators.
export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : null)),
});

export type ProfileInput = z.output<typeof profileSchema>;

export const changePasswordSchema = (policy: PasswordPolicy) =>
  z
    .object({
      currentPassword: z.string().min(1, "Enter your current password"),
      newPassword: passwordSchema(policy),
      confirmPassword: z.string().min(1, "Repeat the new password"),
    })
    .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The passwords do not match" })
    .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password you have not used here before" });

export type ChangePasswordInput = z.output<ReturnType<typeof changePasswordSchema>>;
