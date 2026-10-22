"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { recordReturn } from "@/actions/pos";
import { calcLine, round2 } from "@/lib/business/totals";
import type { PosPaymentMethod } from "@/lib/generated/prisma/enums";
import { PAYMENT_METHODS } from "@/lib/validation/pos";
import { cn } from "@/lib/utils";

export type ReturnableLineView = {
  saleItemId: string;
  name: string;
  sku: string | null;
  unit: string;
  soldQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  movedStock: boolean;
};

type RefundDraft = { key: string; method: PosPaymentMethod; paymentAccountId: string; amount: number; reference: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  saleNumber: string;
  lines: ReturnableLineView[];
  accounts: { id: string; name: string; type: string }[];
  registerId: string | null;
  vatEnabled: boolean;
};

export function ReturnDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Return items from {props.saleNumber}</DialogTitle>
          <DialogDescription>
            Choose what is coming back. The refund is worked out from what was charged on those lines, including their share of VAT.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per open so quantities always start from what is still returnable. */}
        {props.open ? <ReturnBody {...props} onClose={() => props.onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReturnBody({
  saleId,
  saleNumber,
  lines,
  accounts,
  registerId,
  vatEnabled,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter();
  const format = useFormat();
  const returnable = lines.filter((line) => line.returnableQuantity > 0);

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [refunds, setRefunds] = useState<RefundDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The refund preview uses the same calcLine() the server writes with, so what the cashier is
   * told and what is recorded cannot differ.
   */
  const quote = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let vat = 0;
    let total = 0;
    const chosen: { saleItemId: string; quantity: number }[] = [];
    for (const line of returnable) {
      const quantity = Number(quantities[line.saleItemId] ?? "") || 0;
      if (quantity <= 0) continue;
      const capped = Math.min(quantity, line.returnableQuantity);
      const totals = calcLine({ quantity: capped, unitPrice: line.unitPrice, discountPercent: line.discountPercent, vatRate: line.vatRate });
      subtotal += totals.subtotal;
      discount += totals.discount;
      vat += totals.vat;
      total += totals.total;
      chosen.push({ saleItemId: line.saleItemId, quantity: capped });
    }
    return { subtotal: round2(subtotal), discount: round2(discount), vat: round2(vat), total: round2(total), chosen };
  }, [quantities, returnable]);

  const refundTotal = round2(refunds.reduce((sum, refund) => sum + (Number.isFinite(refund.amount) ? refund.amount : 0), 0));
  const outstanding = round2(quote.total - refundTotal);
  const defaultAccount = accounts.find((a) => a.type === "CASH")?.id ?? accounts[0]?.id ?? "";

  function setQuantity(saleItemId: string, value: string) {
    setQuantities((prev) => ({ ...prev, [saleItemId]: value }));
  }

  function addRefund() {
    setRefunds((prev) => [
      ...prev,
      {
        key: `r${prev.length + 1}-${Date.now()}`,
        method: "CASH",
        paymentAccountId: defaultAccount,
        amount: Math.max(0, prev.length === 0 ? quote.total : outstanding),
        reference: null,
      },
    ]);
  }

  function setRefund(key: string, patch: Partial<RefundDraft>) {
    setRefunds((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await recordReturn({
        saleId,
        registerId,
        lines: quote.chosen,
        refunds: refunds.map((r) => ({ method: r.method, paymentAccountId: r.paymentAccountId, amount: r.amount, reference: r.reference })),
        reason,
        restock,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.number} — ${format.money(result.data.grandTotal)} refunded`);
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (returnable.length === 0) {
    return (
      <>
        <Alert>
          <AlertDescription>Everything on {saleNumber} has already been returned.</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ul className="divide-y rounded-lg border">
          {returnable.map((line) => (
            <li key={line.saleItemId} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format.number(line.returnableQuantity)} of {format.number(line.soldQuantity)} {line.unit} returnable · {format.money(line.unitPrice)}
                  {line.discountPercent > 0 ? ` − ${line.discountPercent}%` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={quantities[line.saleItemId] ?? ""}
                  onChange={(e) => setQuantity(line.saleItemId, e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-9 w-20 text-right"
                  aria-label={`Quantity returned for ${line.name}`}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setQuantity(line.saleItemId, String(line.returnableQuantity))}>
                  All
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <dl className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          <Row label="Goods returning" value={format.money(quote.subtotal)} />
          {quote.discount > 0 ? <Row label="Discount given back" value={`−${format.money(quote.discount)}`} /> : null}
          {vatEnabled ? <Row label="VAT" value={format.money(quote.vat)} /> : null}
          <div className="flex items-center justify-between border-t pt-1.5 text-base font-semibold">
            <dt>To refund</dt>
            <dd className="tabular-nums">{format.money(quote.total)}</dd>
          </div>
        </dl>

        <SettingSwitchRow
          label="Put the goods back in stock"
          description="Turn off for damaged or unsaleable returns — the money still goes back."
          checked={restock}
          onCheckedChange={setRestock}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">How the refund is given</p>
            <Button type="button" variant="outline" size="sm" onClick={addRefund} disabled={quote.total <= 0}>
              <Plus />
              Add
            </Button>
          </div>

          {refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {quote.total <= 0
                ? "Nothing to give back — this line was on a membership or given away. The visit still comes off the sale."
                : `Add at least one refund method. It must add up to ${format.money(quote.total)}.`}
            </p>
          ) : (
            refunds.map((refund, index) => (
              <div key={refund.key} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      aria-pressed={refund.method === method.value}
                      onClick={() => setRefund(refund.key, { method: method.value })}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        refund.method === method.value ? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted",
                      )}
                    >
                      {method.label}
                    </button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label="Remove refund"
                    onClick={() => setRefunds((prev) => prev.filter((r) => r.key !== refund.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Amount" htmlFor={`refund-amount-${index}`} required>
                    <Input
                      id={`refund-amount-${index}`}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={refund.amount}
                      onChange={(e) => setRefund(refund.key, { amount: Number(e.target.value) || 0 })}
                      className="h-10"
                    />
                  </FormField>
                  <FormField label="Taken from" htmlFor={`refund-account-${index}`} required>
                    <Select value={refund.paymentAccountId} onValueChange={(v) => setRefund(refund.key, { paymentAccountId: v })}>
                      <SelectTrigger id={`refund-account-${index}`} className="h-10 w-full">
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
                </div>
              </div>
            ))
          )}

          {refunds.length > 0 && outstanding !== 0 ? (
            <p className={cn("text-sm font-medium", outstanding > 0 ? "text-tint-red-foreground" : "text-tint-amber-foreground")}>
              {outstanding > 0 ? `${format.money(outstanding)} of the refund is unaccounted for.` : `The refund is over by ${format.money(-outstanding)}.`}
            </p>
          ) : null}
        </div>

        <FormField label="Reason" htmlFor="return-reason" required description="Kept on the return and in the audit trail.">
          <Textarea id="return-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || quote.chosen.length === 0 || outstanding !== 0 || !reason.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Refund {format.money(quote.total)}
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
