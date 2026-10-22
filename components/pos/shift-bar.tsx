"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, LockKeyhole, PlayCircle, Store } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { addCashMovement, closeShift, getShiftTotals, openShift } from "@/actions/pos";
import type { RegisterRow } from "@/lib/data/pos";

export type OpenShift = { id: string; openedAt: Date; openedByName: string; openingCash: number };

type Props = {
  registers: RegisterRow[];
  registerId: string;
  onRegisterChange: (id: string) => void;
  openShift: OpenShift | null;
  branchName: string;
  posTypeLabel: string;
};

/** The band above the till: which register, whether a shift is open, and the drawer actions. */
export function ShiftBar({ registers, registerId, onRegisterChange, openShift: shift, branchName, posTypeLabel }: Props) {
  const format = useFormat();
  const [openDialog, setOpenDialog] = useState<null | "open" | "close" | "cash-in" | "cash-out">(null);

  return (
    <>
      <Card size="sm">
        <CardContent className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-foreground">
            <Store className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {branchName} · {posTypeLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              {shift
                ? `Shift open since ${format.dateTime(shift.openedAt)} · float ${format.money(shift.openingCash)} · ${shift.openedByName}`
                : registers.length === 0
                  ? "No register set up yet"
                  : "No shift open — sales will not be tied to a drawer"}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {registers.length > 1 ? (
              <Select value={registerId} onValueChange={onRegisterChange}>
                <SelectTrigger className="h-9 w-40" aria-label="Register">
                  <SelectValue placeholder="Register" />
                </SelectTrigger>
                <SelectContent>
                  {registers.map((register) => (
                    <SelectItem key={register.id} value={register.id}>
                      {register.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : registers.length === 1 ? (
              <StatusBadge tone="neutral">{registers[0].name}</StatusBadge>
            ) : null}

            {shift ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpenDialog("cash-in")}>
                  <ArrowDownToLine />
                  Cash in
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpenDialog("cash-out")}>
                  <ArrowUpFromLine />
                  Cash out
                </Button>
                <Button type="button" size="sm" onClick={() => setOpenDialog("close")}>
                  <LockKeyhole />
                  Close shift
                </Button>
              </>
            ) : registers.length > 0 ? (
              <Button type="button" size="sm" onClick={() => setOpenDialog("open")}>
                <PlayCircle />
                Open shift
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <OpenShiftDialog open={openDialog === "open"} registerId={registerId} onClose={() => setOpenDialog(null)} />
      <CloseShiftDialog open={openDialog === "close"} shift={shift} onClose={() => setOpenDialog(null)} />
      <CashMovementDialog
        open={openDialog === "cash-in" || openDialog === "cash-out"}
        kind={openDialog === "cash-out" ? "CASH_OUT" : "CASH_IN"}
        shiftId={shift?.id ?? null}
        onClose={() => setOpenDialog(null)}
      />
    </>
  );
}

function OpenShiftDialog({ open, registerId, onClose }: { open: boolean; registerId: string; onClose: () => void }) {
  const router = useRouter();
  const [cash, setCash] = useState("0");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const result = await openShift({ registerId, openingCash: cash });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Shift opened");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open shift</DialogTitle>
          <DialogDescription>Count the float in the drawer before you start selling.</DialogDescription>
        </DialogHeader>
        <FormField label="Opening cash" htmlFor="shift-open-cash" required>
          <Input id="shift-open-cash" type="number" step="0.01" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} className="h-11 text-base" />
        </FormField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !registerId}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Open shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftDialog({ open, shift, onClose }: { open: boolean; shift: OpenShift | null; onClose: () => void }) {
  return (
    <Dialog open={open && Boolean(shift)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close shift</DialogTitle>
          <DialogDescription>Count the drawer. BigHawk compares it with what the sales say should be there.</DialogDescription>
        </DialogHeader>
        {open && shift ? <CloseShiftBody shift={shift} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftBody({ shift, onClose }: { shift: OpenShift; onClose: () => void }) {
  const router = useRouter();
  const format = useFormat();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getShiftTotals>> | null>(null);

  // Fetched on mount; the body only exists while the dialog is open, so no reset is needed.
  useEffect(() => {
    let active = true;
    void getShiftTotals(shift.id).then((result) => {
      if (active) setSummary(result);
    });
    return () => {
      active = false;
    };
  }, [shift.id]);

  const expected = summary?.success ? summary.data.expectedCash : null;
  const countedNumber = Number(counted);
  const variance = expected !== null && counted !== "" && Number.isFinite(countedNumber) ? Math.round((countedNumber - expected) * 100) / 100 : null;

  async function submit() {
    setSaving(true);
    try {
      const result = await closeShift({ shiftId: shift.id, countedCash: counted, note });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.variance === 0
          ? "Shift closed and balanced"
          : `Shift closed — ${result.data.variance > 0 ? "over" : "short"} by ${Math.abs(result.data.variance)}`,
      );
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        {summary === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Adding up the shift…
          </div>
        ) : summary.success ? (
          <dl className="space-y-1 rounded-lg border p-3 text-sm">
            <Row label="Opening float" value={format.money(shift.openingCash)} />
            <Row label="Cash sales" value={format.money(summary.data.cashSales)} />
            {summary.data.cardSales > 0 ? <Row label="Card sales" value={format.money(summary.data.cardSales)} /> : null}
            {summary.data.otherSales > 0 ? <Row label="Other sales" value={format.money(summary.data.otherSales)} /> : null}
            {summary.data.cashIn > 0 ? <Row label="Cash in" value={format.money(summary.data.cashIn)} /> : null}
            {summary.data.cashOut > 0 ? <Row label="Cash out" value={`−${format.money(summary.data.cashOut)}`} /> : null}
            <div className="flex items-center justify-between border-t pt-1.5 font-medium">
              <dt>Expected in drawer</dt>
              <dd className="tabular-nums">{format.money(summary.data.expectedCash)}</dd>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">{summary.data.saleCount} sales this shift. Card and transfer takings never enter the drawer.</p>
          </dl>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{summary.error}</AlertDescription>
          </Alert>
        )}

        <FormField label="Counted cash" htmlFor="shift-close-cash" required description="What is physically in the drawer.">
          <Input
            id="shift-close-cash"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="h-11 text-base"
          />
        </FormField>

        {variance !== null ? (
          <div className={`rounded-lg p-3 text-sm ${variance === 0 ? "bg-tint-green text-tint-green-foreground" : "bg-tint-amber text-tint-amber-foreground"}`}>
            {variance === 0 ? "Balanced." : `${variance > 0 ? "Over" : "Short"} by ${format.money(Math.abs(variance))}.`}
          </div>
        ) : null}

        <FormField label="Note" htmlFor="shift-close-note" description="Explain a difference while it is fresh.">
          <Textarea id="shift-close-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || counted === ""}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Close shift
        </Button>
      </DialogFooter>
    </>
  );
}

function CashMovementDialog({ open, kind, shiftId, onClose }: { open: boolean; kind: "CASH_IN" | "CASH_OUT"; shiftId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const isIn = kind === "CASH_IN";

  async function submit() {
    if (!shiftId) return;
    setSaving(true);
    try {
      const result = await addCashMovement({ shiftId, kind, amount, reason });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(isIn ? "Cash added to the drawer" : "Cash taken out of the drawer");
      setAmount("");
      setReason("");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open && Boolean(shiftId)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isIn ? "Cash in" : "Cash out"}</DialogTitle>
          <DialogDescription>
            {isIn ? "Money added to the drawer that is not a sale — extra float, for example." : "Money taken out — a bank run or petty cash."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="Amount" htmlFor="cash-amount" required>
            <Input id="cash-amount" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 text-base" />
          </FormField>
          <FormField label="Reason" htmlFor="cash-reason" required>
            <Input id="cash-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !amount || !reason}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {isIn ? "Add cash" : "Take cash out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
