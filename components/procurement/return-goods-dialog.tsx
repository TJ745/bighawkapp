"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { useFormat } from "@/components/providers/format-provider";
import { sendGoodsBack } from "@/actions/purchase-returns";
import { actionErrorLines } from "@/lib/action-error";
import { calcLine, round2 } from "@/lib/business/totals";

/** A purchase line with something still on the shelf, as the page already worked it out. */
export type ReturnableLineView = {
  purchaseItemId: string;
  description: string;
  returnableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: string;
  purchaseNumber: string;
  lines: ReturnableLineView[];
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  accounts: { id: string; name: string }[];
  /** What has actually been paid, so the dialog cannot offer money back that never went. */
  paidTotal: number;
  today: string;
};

/**
 * Sending goods back to a supplier.
 *
 * The figures shown here come from `calcLine` — the same function the server prices the return
 * with — so the preview and the document cannot disagree. The server prices it again regardless;
 * this is a display, never the authority.
 */
export function ReturnGoodsDialog({
  open,
  onOpenChange,
  purchaseId,
  purchaseNumber,
  lines,
  branches,
  currentBranchId,
  accounts,
  paidTotal,
  today,
}: Props) {
  const router = useRouter();
  const format = useFormat();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [branchId, setBranchId] = useState(currentBranchId ?? branches[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const chosen = useMemo(
    () =>
      lines
        .map((line) => ({ line, quantity: Number(picked[line.purchaseItemId] ?? 0) }))
        .filter((row) => row.quantity > 0 && row.quantity <= row.line.returnableQuantity),
    [lines, picked],
  );

  const total = round2(
    chosen.reduce(
      (sum, row) =>
        sum +
        calcLine({
          quantity: row.quantity,
          unitPrice: row.line.unitPrice,
          discountPercent: row.line.discountPercent,
          vatRate: row.line.vatRate,
        }).total,
      0,
    ),
  );

  async function submit() {
    setSaving(true);
    setProblems([]);
    try {
      const result = await sendGoodsBack({
        purchaseId,
        branchId,
        date,
        reason,
        internalNotes: notes,
        lines: chosen.map((row) => ({ purchaseItemId: row.line.purchaseItemId, quantity: row.quantity })),
        refund: refunding ? { amount: refundAmount || String(total), paymentAccountId: accountId, reference: null } : null,
      });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(
        result.data.refunded > 0
          ? `${result.data.number} — ${format.money(result.data.grandTotal)} returned, ${format.money(result.data.refunded)} back`
          : `${result.data.number} — ${format.money(result.data.grandTotal)} taken off ${purchaseNumber}`,
      );
      setPicked({});
      setReason("");
      setNotes("");
      setRefunding(false);
      setRefundAmount("");
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send goods back on {purchaseNumber}</DialogTitle>
          <DialogDescription>
            The goods come off the shelf and the bill goes down by what they cost. Money only moves if the supplier actually sends some back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Line</TableHead>
                  <TableHead className="text-right">On the shelf</TableHead>
                  <TableHead className="pr-4 w-32 text-right">Sending back</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.purchaseItemId}>
                    <TableCell className="pl-4">{line.description}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{format.number(line.returnableQuantity)}</TableCell>
                    <TableCell className="pr-4">
                      <Input
                        value={picked[line.purchaseItemId] ?? ""}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [line.purchaseItemId]: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0"
                        className="text-right"
                        disabled={line.returnableQuantity <= 0}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Out of which branch" htmlFor="return-branch" required>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="return-branch" className="w-full">
                  <SelectValue placeholder="Choose a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Date" htmlFor="return-date" required>
              <Input id="return-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Why" htmlFor="return-reason" required description="Damaged, wrong item, over-delivered…">
            <Input id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          </FormField>

          <FormField label="Internal note" htmlFor="return-notes">
            <Textarea id="return-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </FormField>

          {paidTotal > 0 ? (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2.5 text-sm font-medium">
                <Checkbox checked={refunding} onCheckedChange={(value) => setRefunding(value === true)} />
                The supplier is sending money back
              </label>
              {refunding ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField label="How much" htmlFor="return-refund" required description={`${format.money(paidTotal)} has been paid`}>
                    <Input
                      id="return-refund"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder={String(total)}
                    />
                  </FormField>
                  <FormField label="Into which account" htmlFor="return-account" required>
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger id="return-account" className="w-full">
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
              ) : (
                <p className="text-xs text-muted-foreground">
                  Otherwise the credit simply reduces what you owe on {purchaseNumber}.
                </p>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Coming off the bill</span>
            <span className="font-semibold tabular-nums">{format.money(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || chosen.length === 0 || !reason.trim() || !branchId}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Send it back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
