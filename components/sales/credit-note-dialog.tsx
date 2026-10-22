"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { issueCreditNote } from "@/actions/credit-notes";
import { actionErrorLines } from "@/lib/action-error";
import { calcLine, round2 } from "@/lib/business/totals";

/** One adjustment row while it is being typed: strings, like every other form field. */
type AdjustmentRow = { description: string; amount: string; vatRate: string };

export type CreditableLineView = {
  invoiceItemId: string;
  description: string;
  quantity: number;
  creditedQuantity: number;
  creditableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  /** What the customer has actually paid: the most that can be handed back as money. */
  paidTotal: number;
  lines: CreditableLineView[];
  accounts: { id: string; name: string }[];
  today: string;
  showVat: boolean;
};

/**
 * Issuing a credit note against an invoice.
 *
 * The amounts come from the invoice's own lines, so the figures here are the ones the server will
 * write — it recomputes them with the same function when the note is issued.
 */
export function CreditNoteDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Credit note against {props.invoiceNumber}</DialogTitle>
          <DialogDescription>
            An issued invoice is never edited. Choose what is being credited and the VAT reverses exactly as it was charged.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so the quantities always start from what is still creditable. */}
        {props.open ? <CreditNoteBody {...props} onClose={() => props.onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreditNoteBody({
  invoiceId,
  invoiceNumber,
  paidTotal,
  lines,
  accounts,
  today,
  showVat,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter();
  const format = useFormat();
  const creditable = lines.filter((line) => line.creditableQuantity > 0);

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  /**
   * Adjustments: credits for an amount rather than for goods. The VAT rate starts from the
   * invoice's own, because an adjustment to that invoice almost always carries the rate it was
   * charged at — and it stays editable, because sometimes it does not.
   */
  const invoiceVatRate = lines.length > 0 && lines.every((line) => line.vatRate === lines[0].vatRate) ? lines[0].vatRate : (lines[0]?.vatRate ?? 0);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const setAdjustment = (index: number, field: keyof AdjustmentRow, value: string) =>
    setAdjustments((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  // The same arithmetic the server uses, so nothing on screen can disagree with what is written.
  const quote = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let vat = 0;
    let total = 0;
    const chosen: { invoiceItemId: string; quantity: number }[] = [];
    for (const line of creditable) {
      const asked = Number(quantities[line.invoiceItemId] ?? "0");
      if (!Number.isFinite(asked) || asked <= 0) continue;
      const quantity = Math.min(asked, line.creditableQuantity);
      const totals = calcLine({ quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, vatRate: line.vatRate });
      subtotal += totals.subtotal;
      discount += totals.discount;
      vat += totals.vat;
      total += totals.total;
      chosen.push({ invoiceItemId: line.invoiceItemId, quantity });
    }

    // An adjustment is one unit priced at the amount, which is how the server prices it too.
    const chosenAdjustments: { description: string; amount: number; vatRate: number }[] = [];
    for (const row of adjustments) {
      const amount = Number(row.amount);
      if (!row.description.trim() || !Number.isFinite(amount) || amount <= 0) continue;
      const vatRate = Number(row.vatRate) || 0;
      const totals = calcLine({ quantity: 1, unitPrice: amount, discountPercent: 0, vatRate });
      subtotal += totals.subtotal;
      discount += totals.discount;
      vat += totals.vat;
      total += totals.total;
      chosenAdjustments.push({ description: row.description.trim(), amount, vatRate });
    }

    return {
      subtotal: round2(subtotal),
      discount: round2(discount),
      vat: round2(vat),
      total: round2(total),
      chosen,
      chosenAdjustments,
    };
  }, [quantities, creditable, adjustments]);

  const refund = refunding ? Math.min(Number(refundAmount) || 0, quote.total, paidTotal) : 0;
  const onAccount = round2(quote.total - refund);

  async function submit() {
    setSaving(true);
    setProblems([]);
    try {
      const result = await issueCreditNote({
        invoiceId,
        date,
        reason,
        internalNotes: notes,
        lines: quote.chosen,
        adjustments: quote.chosenAdjustments,
        refundAmount: refunding ? Number(refundAmount) || 0 : 0,
        refundAccountId: refunding ? accountId : null,
        refundReference: refunding ? reference : null,
      });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(
        result.data.refunded > 0
          ? `${result.data.number} issued — ${format.money(result.data.refunded)} refunded`
          : `${result.data.number} issued — ${format.money(result.data.grandTotal)} credited`,
      );
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {problems.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>
              {problems.length === 1 ? (
                problems[0]
              ) : (
                <ul className="list-inside list-disc">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {creditable.length === 0 ? (
          // No goods left to credit does not mean nothing left to do: an amount can still be credited.
          <p className="py-4 text-center text-sm text-muted-foreground">
            Every line on {invoiceNumber} has already been credited in full. An adjustment below can still credit an amount.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What is being credited</p>
            <ul className="divide-y">
              {creditable.map((line) => (
                <li key={line.invoiceItemId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format.number(line.quantity)} invoiced at {format.money(line.unitPrice)}
                      {line.discountPercent > 0 ? ` − ${line.discountPercent}%` : ""}
                      {showVat && line.vatRate > 0 ? ` + ${line.vatRate}% VAT` : ""}
                      {line.creditedQuantity > 0 ? ` · ${format.number(line.creditedQuantity)} already credited` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      value={quantities[line.invoiceItemId] ?? ""}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [line.invoiceItemId]: e.target.value }))}
                      inputMode="decimal"
                      placeholder="0"
                      className="h-9 w-20 text-center"
                      aria-label={`How much of ${line.description} to credit`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setQuantities((prev) => ({ ...prev, [line.invoiceItemId]: String(line.creditableQuantity) }))}
                    >
                      All
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/**
         * Adjustments.
         *
         * Not everything put right is a quantity — a goodwill discount, a price corrected
         * afterwards, a delivery charge waived. These credit an amount, carry their own VAT rate,
         * and are capped only by what is left on the invoice.
         */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Adjustments</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAdjustments((prev) => [...prev, { description: "", amount: "", vatRate: String(invoiceVatRate) }])}
            >
              <Plus />
              Add an amount
            </Button>
          </div>
          {adjustments.length === 0 ? (
            <p className="text-xs text-muted-foreground">For crediting an amount rather than goods — a discount agreed after the fact, a charge waived.</p>
          ) : (
            <ul className="space-y-2">
              {adjustments.map((row, index) => (
                <li key={index} className="flex items-end gap-2">
                  <FormField label="What for" htmlFor={`adj-desc-${index}`} className="min-w-0 flex-1">
                    <Input
                      id={`adj-desc-${index}`}
                      value={row.description}
                      onChange={(e) => setAdjustment(index, "description", e.target.value)}
                      placeholder="Goodwill discount"
                      autoComplete="off"
                    />
                  </FormField>
                  <FormField label="Amount" htmlFor={`adj-amount-${index}`} className="w-28 shrink-0">
                    <Input
                      id={`adj-amount-${index}`}
                      value={row.amount}
                      onChange={(e) => setAdjustment(index, "amount", e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="text-right"
                    />
                  </FormField>
                  {showVat ? (
                    <FormField label="VAT %" htmlFor={`adj-vat-${index}`} className="w-20 shrink-0">
                      <Input
                        id={`adj-vat-${index}`}
                        value={row.vatRate}
                        onChange={(e) => setAdjustment(index, "vatRate", e.target.value)}
                        inputMode="decimal"
                        className="text-right"
                      />
                    </FormField>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove adjustment ${index + 1}`}
                    onClick={() => setAdjustments((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="space-y-1 rounded-lg border p-3 text-sm">
          <Row label="Subtotal" value={format.money(quote.subtotal)} />
          {quote.discount > 0 ? <Row label="Discount" value={`− ${format.money(quote.discount)}`} /> : null}
          {showVat ? <Row label="VAT reversed" value={format.money(quote.vat)} /> : null}
          <div className="flex items-center justify-between border-t pt-2 font-semibold">
            <dt>Credit note total</dt>
            <dd className="tabular-nums">{format.money(quote.total)}</dd>
          </div>
        </dl>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Date" htmlFor="credit-date" required>
            <Input id="credit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Reason" htmlFor="credit-reason" required description="Goods returned, overcharged, cancelled…">
            <Input id="credit-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          </FormField>
        </div>

        <SettingSwitchRow
          label="Give the money back now"
          description={
            paidTotal > 0
              ? `Up to ${format.money(paidTotal)} has been paid and can be refunded. Otherwise the credit reduces what is owed.`
              : "Nothing has been paid on this invoice yet, so there is nothing to refund — the credit reduces what is owed."
          }
          checked={refunding}
          onCheckedChange={setRefunding}
          disabled={paidTotal <= 0}
        />

        {refunding ? (
          <div className="grid gap-5 sm:grid-cols-3">
            <FormField label="Refund" htmlFor="credit-refund" required>
              <Input id="credit-refund" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} inputMode="decimal" />
            </FormField>
            <FormField label="From account" htmlFor="credit-account" required>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="credit-account" className="w-full">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Reference" htmlFor="credit-reference">
              <Input id="credit-reference" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
            </FormField>
          </div>
        ) : null}

        {quote.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            {refund > 0 ? (
              <>
                <span className="font-medium tabular-nums">{format.money(refund)}</span> goes back to the customer
                {onAccount > 0 ? (
                  <>
                    {" "}
                    and <span className="font-medium tabular-nums">{format.money(onAccount)}</span> comes off what they owe
                  </>
                ) : null}
                .
              </>
            ) : (
              <>
                <span className="font-medium tabular-nums">{format.money(quote.total)}</span> comes off what the customer owes.
              </>
            )}
          </p>
        ) : null}

        <FormField label="Internal note" htmlFor="credit-notes" description="Never shown to the customer.">
          <Textarea id="credit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        {/* An adjustment on its own is a valid credit note, so either list may be what fills it. */}
        <Button
          type="button"
          onClick={submit}
          disabled={saving || (quote.chosen.length === 0 && quote.chosenAdjustments.length === 0) || !reason.trim()}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          Issue credit note
        </Button>
      </DialogFooter>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
