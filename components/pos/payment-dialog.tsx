"use client";

import { useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/shared/form-field";
import { useFormat } from "@/components/providers/format-provider";
import type { PosPaymentMethod } from "@/lib/generated/prisma/enums";
import { PAYMENT_METHODS } from "@/lib/validation/pos";
import { round2 } from "@/lib/business/totals";
import { cn } from "@/lib/utils";

export type PaymentDraft = {
  key: string;
  method: PosPaymentMethod;
  paymentAccountId: string;
  amount: number;
  reference: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  accounts: { id: string; name: string; type: string }[];
  defaultCashAccountId: string;
  onConfirm: (payments: PaymentDraft[]) => Promise<boolean>;
};

const METHOD_ICONS: Record<PosPaymentMethod, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  TRANSFER: Landmark,
  OTHER: Wallet,
};

export function PaymentDialog({ open, onOpenChange, total, accounts, defaultCashAccountId, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>One method or several — the sale is only recorded once the total is covered.</DialogDescription>
        </DialogHeader>
        {/* Mounted per open so each sale starts from a clean tender. */}
        {open ? (
          <PaymentBody total={total} accounts={accounts} defaultCashAccountId={defaultCashAccountId} onConfirm={onConfirm} onCancel={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentBody({
  total,
  accounts,
  defaultCashAccountId,
  onConfirm,
  onCancel,
}: {
  total: number;
  accounts: { id: string; name: string; type: string }[];
  defaultCashAccountId: string;
  onConfirm: (payments: PaymentDraft[]) => Promise<boolean>;
  onCancel: () => void;
}) {
  const format = useFormat();
  const [payments, setPayments] = useState<PaymentDraft[]>([
    { key: "p1", method: "CASH", paymentAccountId: defaultCashAccountId, amount: total, reference: null },
  ]);
  const [saving, setSaving] = useState(false);

  const paid = round2(payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0));
  const remaining = round2(total - paid);
  const cashPaid = round2(payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0));
  const change = round2(Math.max(0, paid - total));
  // Only cash can produce change; a card must never be charged more than the total.
  const overTendered = change > cashPaid;

  function accountFor(method: PosPaymentMethod) {
    if (method === "CASH") return defaultCashAccountId || (accounts[0]?.id ?? "");
    return accounts.find((a) => a.type !== "CASH")?.id ?? accounts[0]?.id ?? "";
  }

  function setPayment(key: string, patch: Partial<PaymentDraft>) {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addPayment() {
    const method: PosPaymentMethod = payments.some((p) => p.method === "CASH") ? "CARD" : "CASH";
    setPayments((prev) => [
      ...prev,
      { key: `p${prev.length + 1}-${Date.now()}`, method, paymentAccountId: accountFor(method), amount: Math.max(0, remaining), reference: null },
    ]);
  }

  async function confirm() {
    setSaving(true);
    try {
      const ok = await onConfirm(payments.filter((p) => p.amount > 0));
      if (!ok) setSaving(false);
    } catch {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <span className="text-sm text-muted-foreground">Total to pay</span>
          <span className="text-xl font-semibold tabular-nums">{format.money(total)}</span>
        </div>

        {payments.map((payment, index) => {
          const Icon = METHOD_ICONS[payment.method];
          return (
            <div key={payment.key} className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    aria-pressed={payment.method === method.value}
                    onClick={() => setPayment(payment.key, { method: method.value, paymentAccountId: accountFor(method.value) })}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      payment.method === method.value ? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    {method.label}
                  </button>
                ))}
                {payments.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label="Remove payment"
                    onClick={() => setPayments((prev) => prev.filter((p) => p.key !== payment.key))}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Amount" htmlFor={`pay-amount-${index}`} required>
                  <div className="relative">
                    <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id={`pay-amount-${index}`}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={payment.amount}
                      onChange={(e) => setPayment(payment.key, { amount: Number(e.target.value) || 0 })}
                      className="h-11 pl-9 text-base"
                    />
                  </div>
                </FormField>
                <FormField label="Goes to" htmlFor={`pay-account-${index}`} required>
                  <Select value={payment.paymentAccountId} onValueChange={(v) => setPayment(payment.key, { paymentAccountId: v })}>
                    <SelectTrigger id={`pay-account-${index}`} className="h-11 w-full">
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
                {payment.method !== "CASH" ? (
                  <FormField label="Reference" htmlFor={`pay-ref-${index}`} className="sm:col-span-2" description="Approval code or transfer reference.">
                    <Input
                      id={`pay-ref-${index}`}
                      value={payment.reference ?? ""}
                      onChange={(e) => setPayment(payment.key, { reference: e.target.value || null })}
                    />
                  </FormField>
                ) : null}
              </div>
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addPayment}>
          <Plus />
          Split payment
        </Button>

        <dl className="space-y-1 rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Tendered</dt>
            <dd className="tabular-nums">{format.money(paid)}</dd>
          </div>
          {remaining > 0 ? (
            <div className="flex items-center justify-between font-medium text-tint-red-foreground">
              <dt>Still to pay</dt>
              <dd className="tabular-nums">{format.money(remaining)}</dd>
            </div>
          ) : (
            <div className="flex items-center justify-between font-medium">
              <dt>Change</dt>
              <dd className="tabular-nums">{format.money(change)}</dd>
            </div>
          )}
        </dl>

        {overTendered ? (
          <Alert variant="destructive">
            <AlertDescription>Only cash can be over-tendered. Reduce the card or transfer amount.</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" className="h-11 text-base" onClick={confirm} disabled={saving || remaining > 0 || overTendered || paid <= 0}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Charge {format.money(total)}
        </Button>
      </DialogFooter>
    </>
  );
}
