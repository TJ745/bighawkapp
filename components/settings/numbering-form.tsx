"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateDocumentNumbering } from "@/actions/settings";
import { formatDocumentNumber } from "@/lib/business/document-number";
import type { DocumentSequenceRow } from "@/lib/data/settings";
import { DOCUMENT_TYPES } from "@/lib/settings/defaults";
import { documentNumberingSchema, type DocumentNumberingInput } from "@/lib/validation/settings";
import { SettingsFormFooter } from "./settings-form-footer";

type Props = { sequences: DocumentSequenceRow[]; canEdit: boolean };

export function NumberingForm({ sequences, canEdit }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  const form = useForm<DocumentNumberingInput>({
    resolver: zodResolver(documentNumberingSchema),
    defaultValues: {
      sequences: DOCUMENT_TYPES.map((d) => {
        const row = sequences.find((s) => s.type === d.type);
        return {
          type: d.type,
          prefix: row?.prefix ?? d.prefix,
          startingNumber: row?.startingNumber ?? 1,
          includeYear: row?.includeYear ?? true,
        };
      }),
    },
  });
  const { errors, isSubmitting } = form.formState;
  const rows = useWatch({ control: form.control, name: "sequences" });

  async function onSubmit(values: DocumentNumberingInput) {
    setFormError(null);
    const result = await updateDocumentNumbering(values);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    toast.success("Document numbering saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {formError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Document numbering</CardTitle>
          <CardDescription>
            Numbers are generated automatically and never reused. When the year is included, counting restarts each year.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Document</TableHead>
                  <TableHead className="w-32">Prefix</TableHead>
                  <TableHead className="w-36">Starting number</TableHead>
                  <TableHead className="w-28">Include year</TableHead>
                  <TableHead className="pr-6">Next number</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DOCUMENT_TYPES.map((d, index) => {
                  const row = rows?.[index];
                  const saved = sequences.find((s) => s.type === d.type);
                  const prefix = String(row?.prefix ?? "").toUpperCase() || d.prefix;
                  const starting = Number(row?.startingNumber) || 1;
                  const includeYear = Boolean(row?.includeYear);
                  // Preview shows the number that will actually be issued next (never below what was already issued).
                  const restart = includeYear && saved?.currentYear !== null && saved?.currentYear !== undefined && saved.currentYear !== year;
                  const next = restart ? starting : Math.max(saved?.nextNumber ?? 1, starting);
                  const rowErrors = errors.sequences?.[index];
                  return (
                    <TableRow key={d.type}>
                      <TableCell className="pl-6 font-medium">{d.label}</TableCell>
                      <TableCell>
                        <Input
                          aria-label={`${d.label} prefix`}
                          aria-invalid={Boolean(rowErrors?.prefix)}
                          className="uppercase"
                          disabled={!canEdit}
                          {...form.register(`sequences.${index}.prefix`)}
                        />
                        {rowErrors?.prefix ? <p className="mt-1 text-xs text-destructive">{rowErrors.prefix.message}</p> : null}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          aria-label={`${d.label} starting number`}
                          aria-invalid={Boolean(rowErrors?.startingNumber)}
                          disabled={!canEdit}
                          {...form.register(`sequences.${index}.startingNumber`)}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          aria-label={`${d.label} include year`}
                          checked={includeYear}
                          disabled={!canEdit}
                          onCheckedChange={(v) => form.setValue(`sequences.${index}.includeYear`, v, { shouldDirty: true })}
                        />
                      </TableCell>
                      <TableCell className="pr-6 font-mono text-sm text-muted-foreground">
                        {formatDocumentNumber(prefix, includeYear, year, next)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {canEdit ? <SettingsFormFooter saving={isSubmitting} /> : null}
      </Card>
    </form>
  );
}
