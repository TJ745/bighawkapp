import { z } from "zod";
import { DEFAULT_PASSWORD_POLICY, passwordSchema } from "./users";

/**
 * Onboarding a customer, and the limits they were sold.
 *
 * Here rather than beside the actions because a `"use server"` file may only export async
 * functions: a Zod object exported from one makes the whole module unimportable from anywhere
 * that is not an action, with an error that names neither the schema nor the file.
 */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "At least two characters")
  .max(63, "Too long")
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Letters, numbers and hyphens, starting with a letter or number");

/**
 * How many users and branches this customer has bought. Both counts include the first of their
 * kind — the administrator and MAIN — because "five users" is easier to sell and to explain than
 * "five plus one". Only the operator sets these; the customer reads them.
 */
const quota = z.coerce.number().int("Whole numbers only").min(1, "At least one").max(500, "That is more than BigHawk is built for");

export const companySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  slug,
  userLimit: quota,
  branchLimit: quota,
});

/**
 * Creating a customer also creates the one person who can sign in to it.
 *
 * The password is typed by the operator and passed to the customer, who changes it from their
 * profile. No invitation email: a company created a minute ago has no mail server configured,
 * and an administrator who cannot sign in has nowhere to configure one.
 *
 * Validated against the **default** password policy rather than a company's own, because the
 * company whose policy would apply does not exist yet — and that default is the one it starts
 * with anyway.
 */
export const newCompanySchema = companySchema.extend({
  adminName: z.string().trim().min(1, "Enter the administrator's name").max(100),
  adminEmail: z.email("Enter a valid email address").trim().toLowerCase(),
  adminPassword: passwordSchema(DEFAULT_PASSWORD_POLICY),
});

export const switchCompanySchema = z.object({ companyId: z.string().min(1) });
