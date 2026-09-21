import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { FieldErrors } from "@/lib/actions";

// Maps server-side validation errors onto react-hook-form fields so they show inline.
export function applyFieldErrors<T extends FieldValues>(form: { setError: UseFormSetError<T> }, fieldErrors?: FieldErrors) {
  if (!fieldErrors) return;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (field === "_form") continue;
    form.setError(field as Path<T>, { type: "server", message: messages[0] });
  }
}
