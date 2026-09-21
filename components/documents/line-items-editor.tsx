"use client";

import { Plus, Trash2 } from "lucide-react";
import { type Control, type FieldErrors, type UseFormRegister, useFieldArray, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFormat } from "@/components/providers/format-provider";
import { calcLine } from "@/lib/business/totals";
import type { LineItemInput } from "@/lib/validation/sales";

// Minimal form shape the editor needs; quotation/invoice/purchase forms all satisfy it.
export type WithItems = { items: LineItemInput[] };

type LineItemsEditorProps<T extends WithItems> = {
  control: Control<T, unknown, unknown>;
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  vatEnabled: boolean;
  allowVatChange: boolean;
  defaultVatRate: number;
};

export function emptyLine(defaultVatRate: number): LineItemInput {
  return { description: "", quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: defaultVatRate };
}

export function LineItemsEditor<T extends WithItems>({ control, register, errors, vatEnabled, allowVatChange, defaultVatRate }: LineItemsEditorProps<T>) {
  // The generic form type is narrowed to WithItems for the array helpers.
  const c = control as unknown as Control<WithItems>;
  const reg = register as unknown as UseFormRegister<WithItems>;
  const errs = errors as FieldErrors<WithItems>;
  const format = useFormat();
  const { fields, append, remove } = useFieldArray({ control: c, name: "items" });
  const items = useWatch({ control: c, name: "items" }) ?? [];
  const showVat = vatEnabled;
  const itemsError = errs.items?.root?.message ?? (typeof errs.items?.message === "string" ? errs.items.message : undefined);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="w-24 px-2 py-2 text-right font-medium">Qty</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Unit price</th>
              <th className="w-24 px-2 py-2 text-right font-medium">Disc. %</th>
              {showVat ? <th className="w-24 px-2 py-2 text-right font-medium">VAT %</th> : null}
              <th className="w-32 px-3 py-2 text-right font-medium">Total</th>
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const row = items[index];
              const line = row
                ? calcLine({
                    quantity: Number(row.quantity) || 0,
                    unitPrice: Number(row.unitPrice) || 0,
                    discountPercent: Number(row.discountPercent) || 0,
                    vatRate: showVat ? Number(row.vatRate) || 0 : 0,
                  })
                : null;
              const rowErrors = errs.items?.[index];
              return (
                <tr key={field.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <Textarea
                      rows={1}
                      placeholder="Describe the product or service"
                      aria-label={`Item ${index + 1} description`}
                      aria-invalid={Boolean(rowErrors?.description)}
                      className="min-h-8 resize-y"
                      {...reg(`items.${index}.description`)}
                    />
                    {rowErrors?.description ? <p className="mt-1 text-xs text-destructive">{rowErrors.description.message}</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" step="0.01" min={0} className="text-right" aria-label="Quantity" aria-invalid={Boolean(rowErrors?.quantity)} {...reg(`items.${index}.quantity`)} />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" step="0.01" min={0} className="text-right" aria-label="Unit price" aria-invalid={Boolean(rowErrors?.unitPrice)} {...reg(`items.${index}.unitPrice`)} />
                  </td>
                  <td className="px-2 py-2">
                    <Input type="number" step="0.01" min={0} max={100} className="text-right" aria-label="Discount percent" aria-invalid={Boolean(rowErrors?.discountPercent)} {...reg(`items.${index}.discountPercent`)} />
                  </td>
                  {showVat ? (
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        className="text-right"
                        aria-label="VAT percent"
                        disabled={!allowVatChange}
                        aria-invalid={Boolean(rowErrors?.vatRate)}
                        {...reg(`items.${index}.vatRate`)}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex h-8 items-center justify-end font-medium">{line ? format.number(line.total) : "—"}</div>
                  </td>
                  <td className="px-1 py-2">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove item" disabled={fields.length === 1} onClick={() => remove(index)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {itemsError ? <p className="text-sm text-destructive">{itemsError}</p> : null}
      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLine(showVat ? defaultVatRate : 0))}>
        <Plus />
        Add item
      </Button>
    </div>
  );
}
