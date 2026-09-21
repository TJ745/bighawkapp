import "server-only";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import { AuthorizationError, BusinessError } from "@/lib/auth/errors";

export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: FieldErrors };

/**
 * Runs a Server Action body and converts every failure into a user-friendly result.
 * Raw database errors are never returned to the client.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, ...describeError(error) };
  }
}

export function describeError(error: unknown): { error: string; fieldErrors?: FieldErrors } {
  if (error instanceof ZodError) {
    const fieldErrors: FieldErrors = {};
    for (const issue of error.issues) {
      const key = issue.path.map(String).join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { error: "Please check the highlighted fields.", fieldErrors };
  }
  if (error instanceof AuthorizationError || error instanceof BusinessError) {
    return { error: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { error: "A record with the same value already exists." };
    if (error.code === "P2025") return { error: "The record could not be found. It may have been changed by someone else." };
    if (error.code === "P2003") return { error: "This record is linked to other data and cannot be changed this way." };
  }
  // Next.js redirect()/notFound() throw special errors that must propagate.
  if (isNextControlFlowError(error)) throw error;

  console.error("[action]", error);
  return { error: "Something went wrong. Please try again." };
}

function isNextControlFlowError(error: unknown) {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

/** Parses unknown input with a Zod schema; throws ZodError (handled by runAction). */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}

/** Converts FormData into a plain object (multi-valued keys become arrays). */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key in out) {
      const existing = out[key];
      out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}
