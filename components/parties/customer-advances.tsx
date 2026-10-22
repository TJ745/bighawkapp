"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, HandCoins, Loader2, Plus, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { giveBackAdvance, recordAdvance, returnAdvanceToBalance, settleInvoiceFromAdvance, withdrawAdvance } from "@/actions/advances";
import type { CustomerAdvanceRow } from "@/lib/data/advances";
import type { SettleableInvoice } from "@/lib/data/advances";
import { actionErrorLines } from "@/lib/action-error";
import { CUSTOMER_ADVANCE_STATUS } from "@/lib/validation/advances";

type Props = {
  customerId: string;
  customerName: string;
  advances: CustomerAdvanceRow[];
  /** Invoices with money still owing, for settling an advance against. */
  invoices: SettleableInvoice[];
  accounts: { id: string; name: string }[];
  today: string;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * Money a customer has paid in advance.
 *
 * The card answers two questions a business actually asks: how much of their money are we holding,
 * and what has it gone towards. Applying an advance moves no money — the cash is already in the
 * account — so the wording never calls it a payment being made.
 */
export function CustomerAdvances({ customerId, customerName, advances, invoices, accounts, today, canEdit, canDelete }: Props) {
  const format = useFormat();
  const [takeOpen, setTakeOpen] = useState(false);
  const [applying, setApplying] = useState<CustomerAdvanceRow | null>(null);
  const [refunding, setRefunding] = useState<CustomerAdvanceRow | null>(null);
  const [cancelling, setCancelling] = useState<CustomerAdvanceRow | null>(null);

  const held = advances.filter((a) => a.status !== "CANCELLED").reduce((total, a) => total + a.available, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Money held in advance</CardTitle>
            <CardDescription>
              {held > 0
                ? `${format.money(held)} of ${customerName}'s money is held and not yet put against an invoice.`
                : "Deposits and payments up front, before there is an invoice to put them against."}
            </CardDescription>
          </div>
          {canEdit ? (
            <Button type="button" onClick={() => setTakeOpen(true)}>
              <Plus />
              Record an advance
            </Button>
          ) : null}
        </CardHeader>
        {advances.length === 0 ? (
          <CardContent>
            <EmptyState icon={Wallet} title="No advances yet" description="Record one when a customer pays before being invoiced." />
          </CardContent>
        ) : (
          <CardContent className="space-y-3">
            {advances.map((advance) => (
              <div key={advance.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{advance.number}</p>
                      <StatusBadge tone={CUSTOMER_ADVANCE_STATUS[advance.status].tone}>{CUSTOMER_ADVANCE_STATUS[advance.status].label}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format.date(advance.date)} · {advance.accountName}
                      {advance.reference ? ` · ${advance.reference}` : ""}
                    </p>
                    {advance.cancelReason ? <p className="mt-1 text-xs text-muted-foreground">Cancelled: {advance.cancelReason}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{format.money(advance.amount)}</p>
                    {advance.status !== "CANCELLED" ? (
                      <p className="text-xs text-muted-foreground tabular-nums">{format.money(advance.available)} left</p>
                    ) : null}
                  </div>
                </div>

                {advance.applications.length > 0 || advance.refunds.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t pt-2 text-xs">
                    {advance.applications.map((application) => (
                      <li key={application.paymentId} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {format.money(application.amount)} settled{" "}
                          <Link href={`/sales/invoices/${application.invoiceId}`} className="underline-offset-4 hover:underline">
                            {application.invoiceNumber}
                          </Link>{" "}
                          on {format.date(application.date)}
                        </span>
                        {canEdit ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void takeBack(application.paymentId)}>
                            <Undo2 />
                            Take back
                          </Button>
                        ) : null}
                      </li>
                    ))}
                    {advance.refunds.map((refund) => (
                      <li key={refund.id} className="text-muted-foreground">
                        {format.money(refund.amount)} given back on {format.date(refund.date)} ({refund.accountName})
                      </li>
                    ))}
                  </ul>
                ) : null}

                {canEdit && advance.status !== "CANCELLED" && advance.available > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => setApplying(advance)} disabled={invoices.length === 0}>
                      <HandCoins />
                      Settle an invoice
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRefunding(advance)}>
                      <Undo2 />
                      Give it back
                    </Button>
                    {canDelete && advance.applications.length === 0 && advance.refunds.length === 0 ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(advance)}>
                        <Ban />
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <TakeAdvanceDialog
        open={takeOpen}
        onOpenChange={setTakeOpen}
        customerId={customerId}
        customerName={customerName}
        accounts={accounts}
        today={today}
      />
      <ApplyAdvanceDialog advance={applying} onClose={() => setApplying(null)} invoices={invoices} today={today} />
      <RefundAdvanceDialog advance={refunding} onClose={() => setRefunding(null)} accounts={accounts} today={today} />
      <CancelAdvanceDialog advance={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );

  async function takeBack(paymentId: string) {
    const result = await returnAdvanceToBalance({ paymentId });
    if (!result.success) {
      toast.error(actionErrorLines(result).join(" "));
      return;
    }
    toast.success(`${format.money(result.data.amount)} taken back off ${result.data.invoiceNumber}`);
  }
}

/** Shared shape for the problem list every one of these dialogs shows. */
function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
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
  );
}

function TakeAdvanceDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  accounts,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  accounts: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function submit() {
    setSaving(true);
    setProblems([]);
    try {
      const result = await recordAdvance({ customerId, amount, date, paymentAccountId: accountId, reference, notes });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(`${result.data.number} recorded`);
      setAmount("");
      setReference("");
      setNotes("");
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an advance from {customerName}</DialogTitle>
          <DialogDescription>
            Money received before there is an invoice for it. It counts as income on the day it arrives, and can settle an invoice later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Problems problems={problems} />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Amount" htmlFor="advance-amount" required>
              <Input id="advance-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </FormField>
            <FormField label="Date received" htmlFor="advance-date" required>
              <Input id="advance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Into which account" htmlFor="advance-account" required>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="advance-account" className="w-full">
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
          <FormField label="Reference" htmlFor="advance-reference" description="Transfer number, cheque number…">
            <Input id="advance-reference" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Note" htmlFor="advance-notes" description="What the deposit is for.">
            <Textarea id="advance-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !accountId}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Record it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyAdvanceDialog({
  advance,
  onClose,
  invoices,
  today,
}: {
  advance: CustomerAdvanceRow | null;
  onClose: () => void;
  invoices: SettleableInvoice[];
  today: string;
}) {
  const router = useRouter();
  const format = useFormat();
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const chosen = invoices.find((invoice) => invoice.id === invoiceId);
  // The most that can sensibly go on this invoice: whichever runs out first.
  const suggested = chosen && advance ? Math.min(chosen.owing, advance.available) : 0;

  async function submit() {
    if (!advance) return;
    setSaving(true);
    setProblems([]);
    try {
      const result = await settleInvoiceFromAdvance({ advanceId: advance.id, invoiceId, amount: amount || String(suggested), date });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(`${format.money(result.data.amount)} of ${result.data.advanceNumber} settled ${result.data.invoiceNumber}`);
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(advance)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle an invoice from {advance?.number}</DialogTitle>
          <DialogDescription>
            No money moves — it is already in the account. This decides which invoice the customer&apos;s money settles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Problems problems={problems} />
          <FormField label="Which invoice" htmlFor="apply-invoice" required>
            <Select
              value={invoiceId}
              onValueChange={(value) => {
                setInvoiceId(value);
                const invoice = invoices.find((i) => i.id === value);
                if (invoice && advance) setAmount(String(Math.min(invoice.owing, advance.available)));
              }}
            >
              <SelectTrigger id="apply-invoice" className="w-full">
                <SelectValue placeholder="Choose an invoice" />
              </SelectTrigger>
              <SelectContent>
                {invoices.map((invoice) => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.number} — {format.money(invoice.owing)} owing
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="How much"
              htmlFor="apply-amount"
              required
              description={advance ? `${format.money(advance.available)} available` : undefined}
            >
              <Input id="apply-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </FormField>
            <FormField label="Date" htmlFor="apply-date" required>
              <Input id="apply-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !invoiceId}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Settle it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundAdvanceDialog({
  advance,
  onClose,
  accounts,
  today,
}: {
  advance: CustomerAdvanceRow | null;
  onClose: () => void;
  accounts: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const format = useFormat();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function submit() {
    if (!advance) return;
    setSaving(true);
    setProblems([]);
    try {
      const result = await giveBackAdvance({ advanceId: advance.id, amount: amount || String(advance.available), date, paymentAccountId: accountId, reference });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(`${format.money(result.data.amount)} given back`);
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(advance)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give back {advance?.number}</DialogTitle>
          <DialogDescription>
            Money leaving the business today. Only what has not already settled an invoice can be returned.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Problems problems={problems} />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="How much" htmlFor="refund-amount" required description={advance ? `${format.money(advance.available)} available` : undefined}>
              <Input id="refund-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </FormField>
            <FormField label="Date" htmlFor="refund-date" required>
              <Input id="refund-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Out of which account" htmlFor="refund-account" required>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="refund-account" className="w-full">
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
          <FormField label="Reference" htmlFor="refund-reference">
            <Input id="refund-reference" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !accountId}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Give it back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelAdvanceDialog({ advance, onClose }: { advance: CustomerAdvanceRow | null; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function submit() {
    if (!advance) return;
    setSaving(true);
    setProblems([]);
    try {
      const result = await withdrawAdvance({ advanceId: advance.id, reason });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(`${result.data.number} cancelled`);
      setReason("");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(advance)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {advance?.number}?</DialogTitle>
          <DialogDescription>
            For an advance keyed in error. The record stays, but the money comes back out of income and the account balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Problems problems={problems} />
          <FormField label="Why" htmlFor="cancel-reason" required>
            <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={saving || !reason.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Cancel the advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
