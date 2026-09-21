import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

// Standard labelled field: label (with required marker), control, helper text, error.
export function FormField({ label, htmlFor, required, description, error, children, className }: FormFieldProps) {
  return (
    <Field data-invalid={Boolean(error) || undefined} className={className}>
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </FieldLabel>
      {children}
      {description && !error ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
