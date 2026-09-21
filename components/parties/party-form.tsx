"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilePicker, type PendingFile } from "@/components/shared/file-picker";
import { FormField } from "@/components/shared/form-field";
import { createParty, updateParty } from "@/actions/parties";
import type { PartyDetail, PartyKind } from "@/lib/data/parties";
import type { PartyDocumentCategory, PartyType } from "@/lib/generated/prisma/enums";
import { applyFieldErrors } from "@/lib/form-errors";
import { cn } from "@/lib/utils";
import { PARTY_DOCUMENT_CATEGORIES, partySchema, type PartyFormValues, type PartyValues } from "@/lib/validation/parties";
import { PARTY_CONFIG } from "./party-config";

type PartyFormProps = {
  kind: PartyKind;
  party?: PartyDetail;
};

type TextFieldName = Exclude<keyof PartyFormValues, "type">;

const TYPE_OPTIONS: { value: PartyType; label: string; icon: typeof Building2; description: string }[] = [
  { value: "COMPANY", label: "Company", icon: Building2, description: "A registered business." },
  { value: "INDIVIDUAL", label: "Individual", icon: User, description: "A private person." },
];

export function PartyForm({ kind, party }: PartyFormProps) {
  const router = useRouter();
  const config = PARTY_CONFIG[kind];
  const isEdit = Boolean(party);
  const [formError, setFormError] = useState<string | null>(null);
  const [files, setFiles] = useState<PendingFile<PartyDocumentCategory>[]>([]);

  const form = useForm<PartyFormValues, unknown, PartyValues>({
    resolver: zodResolver(partySchema),
    defaultValues: {
      type: party?.type ?? "COMPANY",
      name: party?.name ?? "",
      contactPerson: party?.contactPerson ?? "",
      phone: party?.phone ?? "",
      email: party?.email ?? "",
      address: party?.address ?? "",
      vatNumber: party?.vatNumber ?? "",
      crNumber: party?.crNumber ?? "",
      nationalAddress: party?.nationalAddress ?? "",
      bankName: party?.bankName ?? "",
      accountName: party?.accountName ?? "",
      iban: party?.iban ?? "",
      accountNumber: party?.accountNumber ?? "",
      notes: party?.notes ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const isCompany = type === "COMPANY";

  async function onSubmit(values: PartyValues) {
    setFormError(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, value ?? "");
    for (const item of files) {
      formData.append("documents", item.file);
      formData.append("documentCategories", item.category);
    }

    let id = party?.id;
    if (party) {
      const result = await updateParty(kind, party.id, formData);
      if (!result.success) {
        applyFieldErrors(form, result.fieldErrors);
        setFormError(result.error);
        return;
      }
    } else {
      const result = await createParty(kind, formData);
      if (!result.success) {
        applyFieldErrors(form, result.fieldErrors);
        setFormError(result.error);
        return;
      }
      id = result.data.id;
    }
    toast.success(party ? `${config.singular} updated` : `${config.singular} created`);
    router.push(`${config.basePath}/${id}`);
    router.refresh();
  }

  const field = (name: TextFieldName, label: string, opts?: { required?: boolean; type?: string; wide?: boolean; multiline?: boolean; rows?: number }) => (
    <FormField
      key={name}
      label={label}
      htmlFor={`party-${name}`}
      required={opts?.required}
      error={errors[name]?.message}
      className={opts?.wide ? "sm:col-span-2" : undefined}
    >
      {opts?.multiline ? (
        <Textarea id={`party-${name}`} rows={opts.rows ?? 3} {...form.register(name)} />
      ) : (
        <Input id={`party-${name}`} type={opts?.type ?? "text"} autoComplete="off" {...form.register(name)} />
      )}
    </FormField>
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{config.singular} details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={`${config.singular} type`}>
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => form.setValue("type", opt.value, { shouldDirty: true })}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                  )}
                >
                  <opt.icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {field("name", isCompany ? "Company name" : "Full name", { required: true })}
            {isCompany ? field("contactPerson", "Contact person") : null}
            {field("phone", "Phone", { required: true, type: "tel" })}
            {field("email", "Email", { type: "email" })}
            {field("address", "Address", { wide: true, multiline: true, rows: 2 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>Shown on quotations and invoices when available.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {field("vatNumber", "VAT number")}
          {isCompany ? field("crNumber", "CR number") : null}
          {field("nationalAddress", "National address", { wide: true })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {field("bankName", "Bank name")}
          {field("accountName", "Account name")}
          {field("iban", "IBAN")}
          {field("accountNumber", "Account number")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents & notes</CardTitle>
          <CardDescription>
            {isEdit ? "Add more documents here; existing ones are managed from the Documents tab." : "Upload VAT/CR certificates and other files."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FilePicker files={files} onChange={setFiles} categories={PARTY_DOCUMENT_CATEGORIES} defaultCategory="OTHER" />
          {field("notes", "Notes", { multiline: true, rows: 4 })}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={party ? `${config.basePath}/${party.id}` : config.basePath}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {party ? "Save changes" : `Create ${config.singular.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
