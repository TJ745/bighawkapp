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
import { actionErrorLines } from "@/lib/action-error";
import {
  ADVANCE_STATUS,
  PARTY_ADVANCE_COPY,
  type PartyAdvanceCopy,
  type PartyAdvanceRow,
  type PartyKind,
  type SettleableDocument,
} from "./party-advances-config";

type Props = {
  kind: PartyKind;
  partyId: string;
  partyName: string;
  advances: PartyAdvanceRow[];
  /** Invoices or purchases with money still owing, for settling an advance against. */
  documents: SettleableDocument[];
  accounts: { id: string; name: string }[];
  today: string;
  canEdit: boolean;
  canDelete: boolean;
};

/**
 * Money paid in advance, either way round.
 *
 * The card answers two questions a business actually asks: how much of this money is outstanding,
 * and what has it gone towards. Applying an advance moves no money — the cash has already changed
 * hands — so the wording never calls it a payment being made. Everything that differs between a
 * customer and a supplier lives in `party-advances-config.ts`.
 */
export function PartyAdvances({ kind, partyId, partyName, advances, documents, accounts, today, canEdit, canDelete }: Props) {
  const copy = PARTY_ADVANCE_COPY[kind];
  const format = useFormat();
  const [takeOpen, setTakeOpen] = useState(false);
  const [applying, setApplying] = useState<PartyAdvanceRow | null>(null);
  const [refunding, setRefunding] = useState<PartyAdvanceRow | null>(null);
  const [cancelling, setCancelling] = useState<PartyAdvanceRow | null>(null);

  const held = advances.filter((a) => a.status !== "CANCELLED").reduce((total, a) => total + a.available, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{copy.cardTitle}</CardTitle>
            <CardDescription>{held > 0 ? copy.heldLine(format.money(held), partyName) : copy.blurb}</CardDescription>
          </div>
          {canEdit ? (
            <Button type="button" onClick={() => setTakeOpen(true)}>
              <Plus />
              {copy.recordButton}
            </Button>
          ) : null}
        </CardHeader>
        {advances.length === 0 ? (
          <CardContent>
            <EmptyState icon={Wallet} title={copy.emptyTitle} description={copy.emptyBody} />
          </CardContent>
        ) : (
          <CardContent className="space-y-3">
            {advances.map((advance) => (
              <div key={advance.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{advance.number}</p>
                      <StatusBadge tone={ADVANCE_STATUS[advance.status].tone}>{ADVANCE_STATUS[advance.status].label}</StatusBadge>
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
                          <Link href={copy.documentHref(application.documentId)} className="underline-offset-4 hover:underline">
                            {application.documentNumber}
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
                        {copy.refundLine(format.money(refund.amount), format.date(refund.date), refund.accountName)}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {canEdit && advance.status !== "CANCELLED" && advance.available > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => setApplying(advance)} disabled={documents.length === 0}>
                      <HandCoins />
                      {copy.settleButton}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRefunding(advance)}>
                      <Undo2 />
                      {copy.giveBackButton}
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

      <TakeAdvanceDialog open={takeOpen} onOpenChange={setTakeOpen} copy={copy} partyId={partyId} partyName={partyName} accounts={accounts} today={today} />
      <ApplyAdvanceDialog advance={applying} onClose={() => setApplying(null)} copy={copy} documents={documents} today={today} />
      <RefundAdvanceDialog advance={refunding} onClose={() => setRefunding(null)} copy={copy} accounts={accounts} today={today} />
      <CancelAdvanceDialog advance={cancelling} onClose={() => setCancelling(null)} copy={copy} />
    </div>
  );

  async function takeBack(paymentId: string) {
    const result = await copy.api.takeBack(paymentId);
    if (!result.success) {
      toast.error(actionErrorLines(result).join(" "));
      return;
    }
    toast.success(`${format.money(result.data.amount)} taken back off ${result.data.documentNumber}`);
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
  copy,
  partyId,
  partyName,
  accounts,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copy: PartyAdvanceCopy;
  partyId: string;
  partyName: string;
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
      const result = await copy.api.record({ partyId, amount, date, paymentAccountId: accountId, reference, notes });
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
          <DialogTitle>{copy.recordTitle(partyName)}</DialogTitle>
          <DialogDescription>{copy.recordBlurb}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Problems problems={problems} />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Amount" htmlFor="advance-amount" required>
              <Input id="advance-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </FormField>
            <FormField label={copy.dateLabel} htmlFor="advance-date" required>
              <Input id="advance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label={copy.accountLabel} htmlFor="advance-account" required>
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
          <FormField label="Note" htmlFor="advance-notes" description={copy.notesHint}>
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
  copy,
  documents,
  today,
}: {
  advance: PartyAdvanceRow | null;
  onClose: () => void;
  copy: PartyAdvanceCopy;
  documents: SettleableDocument[];
  today: string;
}) {
  const router = useRouter();
  const format = useFormat();
  const [documentId, setDocumentId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const chosen = documents.find((document) => document.id === documentId);
  // The most that can sensibly go on this document: whichever runs out first.
  const suggested = chosen && advance ? Math.min(chosen.owing, advance.available) : 0;

  async function submit() {
    if (!advance) return;
    setSaving(true);
    setProblems([]);
    try {
      const result = await copy.api.settle({ advanceId: advance.id, documentId, amount: amount || String(suggested), date });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(`${format.money(result.data.amount)} of ${result.data.advanceNumber} settled ${result.data.documentNumber}`);
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
          <DialogTitle>{copy.settleTitle(advance?.number ?? "")}</DialogTitle>
          <DialogDescription>{copy.settleBlurb}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Problems problems={problems} />
          <FormField label={copy.documentLabel} htmlFor="apply-document" required>
            <Select
              value={documentId}
              onValueChange={(value) => {
                setDocumentId(value);
                const document = documents.find((d) => d.id === value);
                if (document && advance) setAmount(String(Math.min(document.owing, advance.available)));
              }}
            >
              <SelectTrigger id="apply-document" className="w-full">
                <SelectValue placeholder={copy.documentPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {documents.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.number} — {format.money(document.owing)} owing
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="How much" htmlFor="apply-amount" required description={advance ? `${format.money(advance.available)} available` : undefined}>
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
          <Button type="button" onClick={submit} disabled={saving || !documentId}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {copy.settleAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundAdvanceDialog({
  advance,
  onClose,
  copy,
  accounts,
  today,
}: {
  advance: PartyAdvanceRow | null;
  onClose: () => void;
  copy: PartyAdvanceCopy;
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
      const result = await copy.api.giveBack({
        advanceId: advance.id,
        amount: amount || String(advance.available),
        date,
        paymentAccountId: accountId,
        reference,
      });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(`${format.money(result.data.amount)} recorded`);
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
          <DialogTitle>{copy.giveBackTitle(advance?.number ?? "")}</DialogTitle>
          <DialogDescription>{copy.giveBackBlurb}</DialogDescription>
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
          <FormField label={copy.giveBackAccountLabel} htmlFor="refund-account" required>
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
            {copy.giveBackAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelAdvanceDialog({ advance, onClose, copy }: { advance: PartyAdvanceRow | null; onClose: () => void; copy: PartyAdvanceCopy }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  async function submit() {
    if (!advance) return;
    setSaving(true);
    setProblems([]);
    try {
      const result = await copy.api.withdraw({ advanceId: advance.id, reason });
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
          <DialogDescription>{copy.cancelBlurb}</DialogDescription>
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
            Cancel it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
