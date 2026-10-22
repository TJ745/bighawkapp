"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { FormField } from "@/components/shared/form-field";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { receiveDelivery } from "@/actions/receiving";
import { actionErrorLines } from "@/lib/action-error";

export type ReceivableLineView = {
  purchaseItemId: string;
  description: string;
  variantId: string | null;
  variantName: string | null;
  unit: string | null;
  tracksStock: boolean;
  orderedQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  unitCost: number;
};

export type ReceivableItemOption = { variantId: string; name: string; unit: string; tracksStock: boolean; onHand: number | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: string;
  purchaseNumber: string;
  lines: ReceivableLineView[];
  items: ReceivableItemOption[];
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  today: string;
};

/**
 * Booking a delivery in.
 *
 * Each purchase line is matched to the catalogue item it buys — remembered afterwards, so a second
 * delivery needs no picking — and only matched lines become stock. Rent, courier and fees stay as
 * costs, which is why nothing forces every line to be linked.
 */
export function ReceiveDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive against {props.purchaseNumber}</DialogTitle>
          <DialogDescription>
            Say what arrived and where. Matched lines go onto the shelf at the price paid, excluding VAT; lines that are costs can be left alone.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so quantities always start from what is still outstanding. */}
        {props.open ? <ReceiveBody {...props} onClose={() => props.onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type Row = { variantId: string; quantity: string };

function ReceiveBody({ purchaseId, purchaseNumber, lines, items, branches, currentBranchId, today, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const format = useFormat();
  const outstanding = lines.filter((line) => line.outstandingQuantity > 0);

  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      outstanding.map((line) => [
        line.purchaseItemId,
        // A line that already knows its item is pre-filled and ready to confirm.
        { variantId: line.variantId ?? "", quantity: line.variantId ? String(line.outstandingQuantity) : "" },
      ]),
    ),
  );
  const [branchId, setBranchId] = useState(currentBranchId ?? branches[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [updateCost, setUpdateCost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const chosen = useMemo(
    () =>
      outstanding
        .map((line) => {
          const row = rows[line.purchaseItemId];
          const quantity = Math.min(Number(row?.quantity) || 0, line.outstandingQuantity);
          return { line, variantId: row?.variantId ?? "", quantity };
        })
        .filter((entry) => entry.variantId && entry.quantity > 0),
    [rows, outstanding],
  );

  const value = chosen.reduce((sum, entry) => sum + entry.quantity * entry.line.unitCost, 0);

  async function submit() {
    setSaving(true);
    setProblems([]);
    try {
      const result = await receiveDelivery({
        purchaseId,
        branchId,
        date,
        note,
        updateCostPrice: updateCost,
        lines: chosen.map((entry) => ({ purchaseItemId: entry.line.purchaseItemId, variantId: entry.variantId, quantity: entry.quantity })),
      });
      if (!result.success) {
        setProblems(actionErrorLines(result));
        return;
      }
      toast.success(
        result.data.stockLines > 0
          ? `${result.data.number} — ${result.data.stockLines} ${result.data.stockLines === 1 ? "line" : "lines"} into stock at ${result.data.branchName}`
          : `${result.data.number} recorded`,
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

        {outstanding.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Everything on {purchaseNumber} has already arrived.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What arrived</p>
            <ul className="divide-y">
              {outstanding.map((line) => {
                const row = rows[line.purchaseItemId];
                const item = items.find((option) => option.variantId === row?.variantId);
                return (
                  <li key={line.purchaseItemId} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format.number(line.orderedQuantity)} ordered at {format.money(line.unitCost)} each
                          {line.receivedQuantity > 0 ? ` · ${format.number(line.receivedQuantity)} already in` : ""} · {format.number(line.outstandingQuantity)}{" "}
                          outstanding
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Input
                          value={row?.quantity ?? ""}
                          onChange={(e) =>
                            setRows((prev) => ({ ...prev, [line.purchaseItemId]: { variantId: prev[line.purchaseItemId]?.variantId ?? "", quantity: e.target.value } }))
                          }
                          inputMode="decimal"
                          placeholder="0"
                          className="h-9 w-20 text-center"
                          aria-label={`How much of ${line.description} arrived`}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setRows((prev) => ({
                              ...prev,
                              [line.purchaseItemId]: { variantId: prev[line.purchaseItemId]?.variantId ?? "", quantity: String(line.outstandingQuantity) },
                            }))
                          }
                        >
                          All
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Combobox
                          options={items.map((option) => ({
                            value: option.variantId,
                            label: option.onHand === null ? option.name : `${option.name} · ${option.onHand} in`,
                          }))}
                          value={row?.variantId ?? ""}
                          onChange={(value) =>
                            setRows((prev) => ({ ...prev, [line.purchaseItemId]: { variantId: value, quantity: prev[line.purchaseItemId]?.quantity ?? "" } }))
                          }
                          placeholder="Not stock — leave blank"
                          searchPlaceholder="Search the catalogue…"
                        />
                      </div>
                      {item && !item.tracksStock ? <span className="shrink-0 text-xs text-muted-foreground">No stock kept</span> : null}
                      {item ? <span className="shrink-0 text-xs text-muted-foreground">{item.unit}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Arrived at" htmlFor="receive-branch" required description="Stock is held per branch.">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="receive-branch" className="w-full">
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
          <FormField label="Date" htmlFor="receive-date" required>
            <Input id="receive-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>

        <SettingSwitchRow
          label="Update the cost price"
          description="Writes what you paid onto the item, so margins use the latest cost. Leave off to keep the costs you set by hand."
          checked={updateCost}
          onCheckedChange={setUpdateCost}
        />

        <FormField label="Note" htmlFor="receive-note" description="Delivery note number, damage, short shipment…">
          <Textarea id="receive-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>

        {chosen.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {chosen.length} {chosen.length === 1 ? "line" : "lines"} going in, worth{" "}
            <span className="font-medium tabular-nums">{format.money(value)}</span> at cost.
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || chosen.length === 0 || !branchId}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Book it in
        </Button>
      </DialogFooter>
    </>
  );
}
