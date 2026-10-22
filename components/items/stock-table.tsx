"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Boxes, History, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { ListToolbar } from "@/components/shared/list-toolbar";
import { ExportButton } from "@/components/shared/export-button";
import { exportStock } from "@/actions/export";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { getStockHistory, recordStockAdjustment, recordStockTransfer } from "@/actions/inventory";
import type { StockMovementRow, StockRow } from "@/lib/data/items";
import { MOVEMENT_LABELS } from "@/lib/validation/items";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "active", label: "Active items" },
  { value: "low", label: "Low stock" },
  { value: "all", label: "All" },
];

export type StockBranch = { id: string; name: string };

type Props = {
  rows: StockRow[];
  total: number;
  page: number;
  lowCount: number;
  hasQuery: boolean;
  canEdit: boolean;
  branch: StockBranch;
  branches: StockBranch[];
};

export function StockTable({ rows, total, page, lowCount, hasQuery, canEdit, branch, branches }: Props) {
  const format = useFormat();
  const [adjusting, setAdjusting] = useState<StockRow | null>(null);
  const [transferring, setTransferring] = useState<StockRow | null>(null);
  const [history, setHistory] = useState<StockRow | null>(null);

  return (
    <div className="space-y-4">
      <ListToolbar filters={FILTERS} searchPlaceholder="Search stock by item, code or brand">
        <ExportButton action={exportStock} />
      </ListToolbar>

      {lowCount > 0 ? (
        <Alert>
          <AlertDescription>
            {lowCount} {lowCount === 1 ? "item is" : "items are"} at or below their minimum stock in {branch.name}.
          </AlertDescription>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={hasQuery ? "No stock matches" : "Nothing stocked yet"}
          description={hasQuery ? "Try a different search." : "Stock appears here once you add products that are tracked."}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden md:table-cell">SKU / barcode</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Minimum</TableHead>
                <TableHead className="w-32">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.variantId}>
                  <TableCell>
                    <p className="font-medium">{row.itemName}</p>
                    {row.variantName && row.variantName !== row.itemName ? (
                      <p className="text-xs text-muted-foreground">{row.variantName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{row.sku ?? row.barcode ?? "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{row.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={cn("inline-flex items-center gap-1", row.isLow && "font-medium text-tint-red-foreground")}>
                      {row.isLow ? <AlertTriangle className="size-3.5" /> : null}
                      {format.number(row.quantity)} {row.unit}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                    {row.minStock > 0 ? format.number(row.minStock) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="Movements" title="Movements" onClick={() => setHistory(row)}>
                        <History />
                      </Button>
                      {canEdit && branches.length > 1 ? (
                        <Button variant="ghost" size="icon" aria-label="Transfer" title="Transfer to another branch" onClick={() => setTransferring(row)}>
                          <ArrowRightLeft />
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button variant="ghost" size="icon" aria-label="Adjust stock" title="Adjust stock" onClick={() => setAdjusting(row)}>
                          <SlidersHorizontal />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} total={total} />

      <AdjustDialog row={adjusting} branch={branch} onClose={() => setAdjusting(null)} />
      <TransferDialog row={transferring} branch={branch} branches={branches} onClose={() => setTransferring(null)} />
      <HistoryDialog row={history} branch={branch} onClose={() => setHistory(null)} />
    </div>
  );
}

function AdjustDialog({ row, branch, onClose }: { row: StockRow | null; branch: StockBranch; onClose: () => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {row?.itemName}
            {row?.variantName && row.variantName !== row.itemName ? ` · ${row.variantName}` : ""} in {branch.name}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open starts from the quantity on screen. */}
        {row ? <AdjustBody row={row} branch={branch} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustBody({ row, branch, onClose }: { row: StockRow; branch: StockBranch; onClose: () => void }) {
  const [mode, setMode] = useState<"count" | "delta">("count");
  const [counted, setCounted] = useState(String(row.quantity));
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await recordStockAdjustment({
        variantId: row.variantId,
        branchId: branch.id,
        mode,
        countedQuantity: mode === "count" ? counted : undefined,
        delta: mode === "delta" ? delta : undefined,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${row.itemName} now ${result.data.balance} ${row.unit} in ${branch.name}`);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FormField label="What are you doing?" htmlFor="adjust-mode">
            <Select value={mode} onValueChange={(v) => setMode(v as "count" | "delta")}>
              <SelectTrigger id="adjust-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Recording a stock count</SelectItem>
                <SelectItem value="delta">Adding or removing stock</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {mode === "count" ? (
            <FormField label={`Counted quantity (${row.unit})`} htmlFor="adjust-counted" required description={`Currently ${row.quantity}.`}>
              <Input id="adjust-counted" type="number" step="0.001" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
            </FormField>
          ) : (
            <FormField
              label={`Change (${row.unit})`}
              htmlFor="adjust-delta"
              required
              description="Positive adds stock, negative removes it — e.g. -2 for damage."
            >
              <Input id="adjust-delta" type="number" step="0.001" inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </FormField>
          )}
          <FormField label="Reason" htmlFor="adjust-note" description="Kept with the movement so the change can be explained later.">
            <Textarea id="adjust-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save adjustment
        </Button>
      </DialogFooter>
    </>
  );
}

function TransferDialog({ row, branch, branches, onClose }: { row: StockRow | null; branch: StockBranch; branches: StockBranch[]; onClose: () => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer stock</DialogTitle>
          <DialogDescription>
            {row?.itemName} — moving out of {branch.name}. Both sides are recorded together.
          </DialogDescription>
        </DialogHeader>
        {row ? <TransferBody row={row} branch={branch} branches={branches} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TransferBody({ row, branch, branches, onClose }: { row: StockRow; branch: StockBranch; branches: StockBranch[]; onClose: () => void }) {
  const others = branches.filter((b) => b.id !== branch.id);
  const [toBranchId, setToBranchId] = useState(others[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await recordStockTransfer({ variantId: row.variantId, fromBranchId: branch.id, toBranchId, quantity, note });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Stock transferred");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="To branch" htmlFor="transfer-to" required>
            <Select value={toBranchId} onValueChange={setToBranchId}>
              <SelectTrigger id="transfer-to" className="w-full">
                <SelectValue placeholder="Choose a branch" />
              </SelectTrigger>
              <SelectContent>
                {others.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        <FormField label={`Quantity (${row.unit})`} htmlFor="transfer-qty" required description={`${row.quantity} on hand here.`}>
            <Input id="transfer-qty" type="number" step="0.001" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
          <FormField label="Note" htmlFor="transfer-note">
            <Input id="transfer-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !toBranchId}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Transfer
        </Button>
      </DialogFooter>
    </>
  );
}

function HistoryDialog({ row, branch, onClose }: { row: StockRow | null; branch: StockBranch; onClose: () => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Stock movements</DialogTitle>
          <DialogDescription>
            {row?.itemName}
            {row?.variantName && row.variantName !== row.itemName ? ` · ${row.variantName}` : ""} in {branch.name}
          </DialogDescription>
        </DialogHeader>
        {row ? <HistoryBody variantId={row.variantId} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ variantId, onClose }: { variantId: string; onClose: () => void }) {
  const format = useFormat();
  const [movements, setMovements] = useState<StockMovementRow[] | null>(null);

  useEffect(() => {
    let active = true;
    void getStockHistory(variantId).then((result) => {
      if (!active) return;
      if (result.success) setMovements(result.data);
      else {
        toast.error(result.error);
        setMovements([]);
      }
    });
    return () => {
      active = false;
    };
  }, [variantId]);

  return (
    <>
      <div className="min-h-32">
          {movements === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading movements…
            </div>
          ) : movements.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {movements.map((movement) => (
                <li key={movement.id} className="flex items-start gap-3 py-2.5">
                  <StatusBadge tone={movement.quantity > 0 ? "success" : "danger"} className="mt-0.5 shrink-0">
                    {movement.quantity > 0 ? "+" : ""}
                    {format.number(movement.quantity)}
                  </StatusBadge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{MOVEMENT_LABELS[movement.kind]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[movement.reference, movement.note, movement.userName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">{format.number(movement.balanceAfter)}</p>
                    <p className="text-xs text-muted-foreground">{format.dateTime(movement.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
