"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldErrors, type Resolver } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { FilePicker, type PendingFile } from "@/components/shared/file-picker";
import { FormField } from "@/components/shared/form-field";
import { PaymentTermSelect } from "@/components/shared/payment-term-select";
import { createInvoice, updateInvoice } from "@/actions/invoices";
import { createPurchase, updatePurchase } from "@/actions/purchases";
import { createQuotation, updateQuotation } from "@/actions/quotations";
import { createSupplierQuotation, updateSupplierQuotation } from "@/actions/supplier-quotations";
import type { ActionResult } from "@/lib/actions";
import { calcDeposit, calcTotals } from "@/lib/business/totals";
import type { PartyOption } from "@/lib/data/parties";
import { addDays, toDateOnly } from "@/lib/dates";
import { applyFieldErrors } from "@/lib/form-errors";
import { purchaseSchema, supplierQuotationSchema } from "@/lib/validation/procurement";
import { invoiceSchema, quotationSchema, type LineItemInput } from "@/lib/validation/sales";
import { useFormat } from "@/components/providers/format-provider";
import { AttachmentList } from "./attachment-list";
import { DOCUMENT_KIND, type DocumentKind } from "./document-kinds";
import { emptyLine, LineItemsEditor } from "./line-items-editor";
import { TotalsSummary } from "./totals-summary";

export type DocumentFormSettings = {
  vatEnabled: boolean;
  defaultVatRate: number;
  allowVatChange: boolean;
  defaultPaymentTermDays: number;
  defaultDepositPercent: number;
  defaultRemainingDueDays: number;
  quotationTerms: string;
  invoiceTerms: string;
};

/** Existing document data the form needs (a subset shared by all four detail types). */
export type EditableDocument = {
  id: string;
  number: string;
  date: Date;
  validUntil?: Date | null;
  dueDate?: Date;
  paymentTermDays?: number;
  depositPercent?: number;
  terms?: string | null;
  internalNotes?: string | null;
  notes?: string | null;
  supplierReference?: string | null;
  customerId?: string | null;
  supplierId?: string;
  projectId?: string | null;
  items: { description: string; quantity: number; unitPrice: number; discountPercent: number; vatRate: number }[];
  attachments: { id: string; name: string; url: string; size: number; fileKey: string; mimeType: string; createdAt: Date }[];
};

export type LinkOption = { id: string; name: string; customerId?: string };

type DocumentFormProps = {
  kind: DocumentKind;
  parties: PartyOption[];
  settings: DocumentFormSettings;
  today: string;
  document?: EditableDocument;
  // Preselect the customer/supplier when creating from a profile page.
  partyId?: string;
  // Optional links: customers (purchases only) and projects (sales documents list only the customer's projects).
  customers?: LinkOption[];
  projects?: LinkOption[];
};

// One superset of fields; the resolver validates only the ones the kind uses.
type FormValues = {
  partyId: string;
  date: string;
  validUntil: string;
  paymentTermDays: number;
  dueDate: string;
  depositPercent: number;
  terms: string;
  internalNotes: string;
  supplierReference: string;
  customerId: string;
  projectId: string;
  items: LineItemInput[];
};

const DEFAULT_VALIDITY_DAYS = 30;

// Maps the superset form values to each kind's payload, validates with that kind's schema,
// and maps error paths back to the form's field names.
function toPayload(kind: DocumentKind, v: FormValues): unknown {
  switch (kind) {
    case "quotation":
      return { customerId: v.partyId, projectId: v.projectId, date: v.date, validUntil: v.validUntil, terms: v.terms, items: v.items };
    case "invoice":
      return {
        customerId: v.partyId,
        projectId: v.projectId,
        date: v.date,
        paymentTermDays: v.paymentTermDays,
        dueDate: v.dueDate,
        depositPercent: v.depositPercent,
        terms: v.terms,
        internalNotes: v.internalNotes,
        items: v.items,
      };
    case "supplier-quotation":
      return { supplierId: v.partyId, date: v.date, validUntil: v.validUntil, supplierReference: v.supplierReference, notes: v.internalNotes, items: v.items };
    case "purchase":
      return {
        supplierId: v.partyId,
        date: v.date,
        paymentTermDays: v.paymentTermDays,
        dueDate: v.dueDate,
        supplierReference: v.supplierReference,
        notes: v.internalNotes,
        customerId: v.customerId,
        projectId: v.projectId,
        items: v.items,
      };
  }
}

const SCHEMAS: Record<DocumentKind, z.ZodType> = {
  quotation: quotationSchema,
  invoice: invoiceSchema,
  "supplier-quotation": supplierQuotationSchema,
  purchase: purchaseSchema,
};

// Server/schema field names → form field names (per kind, since customerId means different things).
function fieldNameMap(kind: DocumentKind): Record<string, keyof FormValues> {
  const partyField = kind === "quotation" || kind === "invoice" ? "customerId" : "supplierId";
  return { [partyField]: "partyId", notes: "internalNotes" };
}

function makeResolver(kind: DocumentKind): Resolver<FormValues, unknown, unknown> {
  const map = fieldNameMap(kind);
  return async (values) => {
    const result = SCHEMAS[kind].safeParse(toPayload(kind, values));
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String);
      if (path.length === 0) continue;
      path[0] = map[path[0]] ?? path[0];
      setPath(errors, path, { type: issue.code, message: issue.message });
    }
    return { values: {}, errors: errors as FieldErrors<FormValues> };
  };
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown) {
  let node = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof node[key] !== "object" || node[key] === null) node[key] = /^[0-9]+$/.test(path[i + 1]) ? [] : {};
    node = node[key] as Record<string, unknown>;
  }
  if (node[path[path.length - 1]] === undefined) node[path[path.length - 1]] = value;
}

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Unit price",
  discountPercent: "Discount",
  vatRate: "VAT",
  date: "Date",
  validUntil: "Valid until",
  paymentTermDays: "Payment terms",
  dueDate: "Due date",
  depositPercent: "Deposit",
  terms: "Terms",
  internalNotes: "Notes",
  supplierReference: "Reference",
  customerId: "Customer",
  projectId: "Project",
  items: "Line items",
};

/** Turns a field path ("items.1.quantity") into something a person can act on. */
function describeField(path: string, partyLabel: string) {
  const [head, index, sub] = path.split(".");
  if (head === "partyId") return partyLabel;
  if (head === "items" && index !== undefined) return `Item ${Number(index) + 1}${sub ? ` — ${FIELD_LABELS[sub] ?? sub}` : ""}`;
  return FIELD_LABELS[head] ?? head;
}

const ACTIONS: Record<DocumentKind, { create: (fd: FormData) => Promise<ActionResult<{ id: string }>>; update: (id: string, fd: FormData) => Promise<ActionResult> }> = {
  quotation: { create: createQuotation, update: updateQuotation },
  invoice: { create: createInvoice, update: updateInvoice },
  "supplier-quotation": { create: createSupplierQuotation, update: updateSupplierQuotation },
  purchase: { create: createPurchase, update: updatePurchase },
};

export function DocumentForm({ kind, parties, settings, today, document, partyId, customers = [], projects = [] }: DocumentFormProps) {
  const router = useRouter();
  const format = useFormat();
  const config = DOCUMENT_KIND[kind];
  const isEdit = Boolean(document);
  const [formError, setFormError] = useState<{ message: string; details: string[] } | null>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);

  const initialTerm =
    document?.paymentTermDays ?? (config.hasDeposit && settings.defaultDepositPercent > 0 ? settings.defaultRemainingDueDays : settings.defaultPaymentTermDays);
  const initialDate = document ? toDateOnly(document.date) : today;
  const defaultTerms = kind === "invoice" ? settings.invoiceTerms : kind === "quotation" ? settings.quotationTerms : "";

  const form = useForm<FormValues, unknown, unknown>({
    resolver: makeResolver(kind),
    defaultValues: {
      partyId: (config.partyKind === "customer" ? document?.customerId : document?.supplierId) ?? partyId ?? "",
      date: initialDate,
      validUntil: document ? (document.validUntil ? toDateOnly(document.validUntil) : "") : config.hasValidity ? addDays(today, DEFAULT_VALIDITY_DAYS) : "",
      paymentTermDays: initialTerm,
      dueDate: document?.dueDate ? toDateOnly(document.dueDate) : addDays(today, initialTerm),
      depositPercent: document?.depositPercent ?? (config.hasDeposit ? settings.defaultDepositPercent : 0),
      terms: document ? (document.terms ?? "") : defaultTerms,
      internalNotes: document?.internalNotes ?? document?.notes ?? "",
      supplierReference: document?.supplierReference ?? "",
      customerId: kind === "purchase" ? (document?.customerId ?? "") : "",
      projectId: document?.projectId ?? "",
      items: document
        ? document.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent, vatRate: i.vatRate }))
        : [emptyLine(settings.vatEnabled ? settings.defaultVatRate : 0)],
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [watchParty, watchDate, watchTerm, watchDeposit, watchCustomer, watchProject, watchItems] = useWatch({
    control: form.control,
    name: ["partyId", "date", "paymentTermDays", "depositPercent", "customerId", "projectId", "items"],
  });

  const totals = calcTotals(
    (watchItems ?? []).map((i) => ({
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unitPrice) || 0,
      discountPercent: Number(i.discountPercent) || 0,
      vatRate: settings.vatEnabled ? Number(i.vatRate) || 0 : 0,
    })),
  );
  const deposit = config.hasDeposit ? Number(watchDeposit) || 0 : 0;
  const depositAmount = calcDeposit(totals.grandTotal, deposit);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(watchDate);

  function setTerm(days: number) {
    form.setValue("paymentTermDays", days, { shouldDirty: true });
    if (validDate) form.setValue("dueDate", addDays(watchDate, days), { shouldDirty: true });
  }

  function setDate(value: string) {
    form.setValue("date", value, { shouldDirty: true, shouldValidate: true });
    if (config.hasPaymentTerms && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      form.setValue("dueDate", addDays(value, Number(watchTerm) || 0), { shouldDirty: true });
    }
  }

  async function onSubmit(values: unknown) {
    setFormError(null);
    const formData = new FormData();
    formData.set("payload", JSON.stringify(values));
    for (const f of files) formData.append("attachments", f.file);

    let id = document?.id;
    const result = document ? await ACTIONS[kind].update(document.id, formData) : await ACTIONS[kind].create(formData);
    if (!result.success) {
      const map = fieldNameMap(kind);
      const mapped = Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [map[k] ?? k, v]));
      applyFieldErrors(form, mapped);
      // Not every field is on screen (a project link, a collapsed line), so spell the problems out
      // as well — "check the highlighted fields" with nothing highlighted is a dead end.
      const details = Object.entries(mapped).flatMap(([field, messages]) => messages.map((message) => `${describeField(field, config.partyLabel)}: ${message}`));
      setFormError({ message: result.error, details });
      return;
    }
    if (!document) id = (result as ActionResult<{ id: string }> & { success: true }).data.id;
    toast.success(document ? `${config.label} saved` : `${config.label} created`);
    router.push(`${config.basePath}/${id}`);
    router.refresh();
  }

  const partyOptions = parties.map((p) => ({ value: p.id, label: p.name, description: p.email ?? undefined }));
  // Sales documents may only link the selected customer's projects; purchases may link any project.
  const projectOptions = config.partyKind === "customer" ? projects.filter((p) => p.customerId === watchParty) : projects;
  const selectedParty = parties.find((p) => p.id === watchParty);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription className="grid gap-1">
            <span>{formError.message}</span>
            {formError.details.length > 0 ? (
              <ul className="list-disc pl-4">
                {formError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{config.label} details</CardTitle>
          <CardDescription>{document ? document.number : "The number is assigned automatically when you save."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={config.partyLabel} htmlFor="doc-party" required error={errors.partyId?.message} className="sm:col-span-2">
            <Combobox
              id="doc-party"
              options={partyOptions}
              value={watchParty}
              onChange={(v) => form.setValue("partyId", v, { shouldDirty: true, shouldValidate: true })}
              placeholder={`Choose a ${config.partyLabel.toLowerCase()}`}
              searchPlaceholder={`Search ${config.partyLabel.toLowerCase()}s…`}
              emptyText={`No active ${config.partyLabel.toLowerCase()}s found.`}
              invalid={Boolean(errors.partyId)}
            />
            {config.partyKind === "customer" && selectedParty && !selectedParty.email && !isEdit ? (
              <p className="text-xs text-muted-foreground">This customer has no email — you can still download or print the PDF.</p>
            ) : null}
          </FormField>
          <FormField label={`${config.label} date`} htmlFor="doc-date" required error={errors.date?.message}>
            <Input id="doc-date" type="date" value={watchDate} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          {config.hasValidity ? (
            <FormField label="Valid until" htmlFor="doc-valid" error={errors.validUntil?.message}>
              <Input id="doc-valid" type="date" {...form.register("validUntil")} />
            </FormField>
          ) : null}
          {config.hasPaymentTerms ? (
            <>
              <FormField label={deposit > 0 ? "Remaining due within" : "Payment term"} htmlFor="doc-term" required error={errors.paymentTermDays?.message}>
                <PaymentTermSelect id="doc-term" value={Number(watchTerm) || 0} onChange={setTerm} />
              </FormField>
              <FormField label="Due date" htmlFor="doc-due" required error={errors.dueDate?.message}>
                <Input id="doc-due" type="date" {...form.register("dueDate")} />
              </FormField>
            </>
          ) : null}
          {config.hasDeposit ? (
            <FormField
              label="Deposit (%)"
              htmlFor="doc-deposit"
              description={deposit > 0 ? `Deposit ${format.money(depositAmount)} due on the invoice date.` : "0 = no deposit."}
              error={errors.depositPercent?.message}
            >
              <Input id="doc-deposit" type="number" min={0} max={100} step="0.01" {...form.register("depositPercent")} />
            </FormField>
          ) : null}
          {config.hasSupplierReference ? (
            <FormField
              label={kind === "purchase" ? "Supplier invoice / reference" : "Supplier reference"}
              htmlFor="doc-ref"
              description={kind === "purchase" ? "Once recorded, a received purchase becomes Unpaid (payment expected)." : "The supplier's own quotation number."}
              error={errors.supplierReference?.message}
              className="sm:col-span-2"
            >
              <Input id="doc-ref" {...form.register("supplierReference")} />
            </FormField>
          ) : null}
          {config.hasLinks ? (
            <FormField label="For customer (optional)" htmlFor="doc-customer" error={errors.customerId?.message} className="sm:col-span-2">
              <LinkPicker
                id="doc-customer"
                options={customers}
                value={watchCustomer}
                placeholder="General company purchase"
                onChange={(v) => form.setValue("customerId", v, { shouldDirty: true })}
              />
            </FormField>
          ) : null}
          {projectOptions.length > 0 ? (
            <FormField label="Project (optional)" htmlFor="doc-project" error={errors.projectId?.message} className="sm:col-span-2">
              <LinkPicker id="doc-project" options={projectOptions} value={watchProject} placeholder="No project" onChange={(v) => form.setValue("projectId", v, { shouldDirty: true })} />
            </FormField>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          {!settings.vatEnabled ? <CardDescription>VAT is disabled in Settings.</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <LineItemsEditor
            control={form.control}
            register={form.register}
            errors={errors}
            vatEnabled={settings.vatEnabled}
            allowVatChange={settings.allowVatChange}
            defaultVatRate={settings.defaultVatRate}
          />
          <TotalsSummary
            totals={totals}
            extra={
              deposit > 0
                ? [
                    { label: `Deposit (${deposit}%)`, value: depositAmount },
                    { label: "Remaining", value: Math.max(0, totals.grandTotal - depositAmount) },
                  ]
                : undefined
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{config.hasTerms ? "Terms & attachments" : "Notes & attachments"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          {config.hasTerms ? (
            <FormField label="Terms & conditions" htmlFor="doc-terms" description="Printed on the PDF." error={errors.terms?.message}>
              <Textarea id="doc-terms" rows={4} {...form.register("terms")} />
            </FormField>
          ) : null}
          {config.hasInternalNotes ? (
            <FormField label="Internal notes" htmlFor="doc-notes" description="Only visible to your team — never on the PDF or in emails." error={errors.internalNotes?.message}>
              <Textarea id="doc-notes" rows={3} {...form.register("internalNotes")} />
            </FormField>
          ) : null}
          <div className="space-y-3">
            <p className="text-sm font-medium">Attachments</p>
            {document && document.attachments.length > 0 ? <AttachmentList kind={kind} documentId={document.id} attachments={document.attachments} canEdit /> : null}
            <FilePicker files={files} onChange={setFiles} hint="Supporting documents (PDF, JPG, PNG, WEBP), up to 10 MB each." />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={document ? `${config.basePath}/${document.id}` : config.basePath}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {document ? "Save changes" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}

const NONE = "__none__";

function LinkPicker({ id, options, value, placeholder, onChange }: { id: string; options: LinkOption[]; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <Combobox
      id={id}
      options={[{ value: NONE, label: placeholder }, ...options.map((o) => ({ value: o.id, label: o.name }))]}
      value={value || NONE}
      onChange={(v) => onChange(v === NONE ? "" : v)}
      placeholder={placeholder}
      searchPlaceholder="Search…"
    />
  );
}
