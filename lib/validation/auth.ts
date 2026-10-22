import { z } from "zod";
import { passwordSchema, type PasswordPolicy } from "./users";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Asking for a reset link. Only the address — the answer is the same whether or not it exists. */
export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Setting the new password.
 *
 * The policy comes from Settings → Security, so a reset cannot be used to slip past the rules that
 * apply when an administrator sets a password. Built as a function for the same reason the user
 * schemas are.
 */
export const resetPasswordSchema = (policy: PasswordPolicy) =>
  z
    .object({
      token: z.string().trim().min(1, "This reset link is missing its token."),
      password: passwordSchema(policy),
      confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: "The two passwords do not match",
      path: ["confirmPassword"],
    });

export type ResetPasswordInput = z.input<ReturnType<typeof resetPasswordSchema>>;
