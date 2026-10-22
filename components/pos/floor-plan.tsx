"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2, Merge, Receipt, Scissors, Users, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { divideOrder, joinOrders, moveOrder } from "@/actions/tables";
import { KITCHEN_STATUS_LABELS } from "@/lib/validation/kitchen";
import { cn } from "@/lib/utils";

export type FloorOrderLine = { id: string; name: string; quantity: number; unitPrice: number; modifiers: string[] };

export type FloorOrder = {
  /** How far the kitchen has got with this bill, where the industry has a kitchen. */
  kitchen: "NEW" | "PREPARING" | "READY" | "SERVED" | null;
  id: string;
  number: string;
  total: number;
  guestCount: number | null;
  itemCount: number;
  /** Worked out server-side so the card does not drift from the page it was rendered with. */
  openedAgo: string;
  customerName: string | null;
  lines: FloorOrderLine[];
};

export type FloorTable = {
  id: string;
  name: string;
  area: string | null;
  seats: number;
  isActive: boolean;
  orders: FloorOrder[];
};

type Props = {
  tables: FloorTable[];
  canSell: boolean;
  canMove: boolean;
};

/**
 * The floor: every table, whether anyone is sitting at it, and what they owe so far.
 * Taking the order itself happens at the register — this screen decides which order it opens.
 */
export function FloorPlan({ tables, canSell, canMove }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [seating, setSeating] = useState<FloorTable | null>(null);
  const [guests, setGuests] = useState("2");
  const [moving, setMoving] = useState<{ order: FloorOrder; table: FloorTable } | null>(null);
  const [merging, setMerging] = useState<{ order: FloorOrder; table: FloorTable } | null>(null);
  const [splitting, setSplitting] = useState<{ order: FloorOrder; table: FloorTable } | null>(null);

  const areas = groupByArea(tables);
  const openOrders = tables.flatMap((table) => table.orders.map((order) => ({ order, table })));
  const freeTables = tables.filter((table) => table.isActive && table.orders.length === 0);

  if (tables.length === 0) {
    return (
      <EmptyState
        icon={Utensils}
        title="No tables on the floor plan"
        description="Add the tables at this branch and they will show up here, free or occupied."
        action={
          <Button asChild variant="outline">
            <a href="/pos/tables/setup">Set up tables</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {areas.map(([area, inArea]) => (
        <section key={area} className="space-y-3">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{area}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inArea.map((table) => {
              const busy = table.orders.length > 0;
              return (
                <Card
                  key={table.id}
                  className={cn("overflow-hidden transition-colors", busy && "border-primary/40 bg-sidebar-accent/40", !table.isActive && "opacity-60")}
                >
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{table.name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="size-3" />
                          {table.seats} seats
                        </p>
                      </div>
                      <StatusBadge tone={!table.isActive ? "neutral" : busy ? "info" : "success"}>
                        {!table.isActive ? "Out of use" : busy ? "Occupied" : "Free"}
                      </StatusBadge>
                    </div>

                    {busy ? (
                      <div className="space-y-3">
                        {table.orders.map((order) => (
                          <div key={order.id} className="space-y-2 rounded-lg border bg-card p-3">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate font-medium">{order.number}</span>
                              <span className="font-semibold tabular-nums">{format.money(order.total)}</span>
                            </div>
                            {order.kitchen ? (
                              <StatusBadge tone={order.kitchen === "READY" ? "success" : order.kitchen === "SERVED" ? "neutral" : "warning"}>
                                {KITCHEN_STATUS_LABELS[order.kitchen].label}
                              </StatusBadge>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                              {order.guestCount ? ` · ${order.guestCount} guests` : ""} · {order.openedAgo}
                              {order.customerName ? ` · ${order.customerName}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {canSell ? (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => router.push(`/pos/register?order=${order.id}`)}>
                                    Add items
                                  </Button>
                                  <Button size="sm" onClick={() => router.push(`/pos/register?order=${order.id}&pay=1`)}>
                                    <Receipt />
                                    Pay
                                  </Button>
                                </>
                              ) : null}
                              {canMove ? (
                                <>
                                  <Button size="sm" variant="ghost" aria-label={`Move ${order.number}`} onClick={() => setMoving({ order, table })}>
                                    <ArrowRightLeft />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Merge ${order.number}`}
                                    disabled={openOrders.length < 2}
                                    onClick={() => setMerging({ order, table })}
                                  >
                                    <Merge />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={`Split ${order.number}`}
                                    disabled={order.itemCount < 2}
                                    onClick={() => setSplitting({ order, table })}
                                  >
                                    <Scissors />
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={!canSell || !table.isActive}
                        onClick={() => {
                          setGuests(String(Math.min(table.seats, 2)));
                          setSeating(table);
                        }}
                      >
                        Seat guests
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {/* Seating a party just carries the table and the head count to the register. */}
      <Dialog open={seating !== null} onOpenChange={(open) => !open && setSeating(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Seat guests at {seating?.name}</DialogTitle>
            <DialogDescription>The order opens when the first items are sent to the table.</DialogDescription>
          </DialogHeader>
          <FormField label="How many are seated" htmlFor="floor-guests">
            <Input id="floor-guests" value={guests} onChange={(e) => setGuests(e.target.value)} inputMode="numeric" />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeating(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!seating) return;
                const count = Math.max(1, Math.min(99, Number(guests) || 1));
                router.push(`/pos/register?table=${seating.id}&guests=${count}`);
              }}
            >
              Take the order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveDialog
        context={moving}
        freeTables={freeTables}
        onClose={() => setMoving(null)}
        onDone={() => {
          setMoving(null);
          router.refresh();
        }}
      />

      <MergeDialog
        context={merging}
        openOrders={openOrders}
        onClose={() => setMerging(null)}
        onDone={() => {
          setMerging(null);
          router.refresh();
        }}
      />

      <SplitDialog
        context={splitting}
        onClose={() => setSplitting(null)}
        onDone={() => {
          setSplitting(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function groupByArea(tables: FloorTable[]) {
  const map = new Map<string, FloorTable[]>();
  for (const table of tables) {
    const key = table.area?.trim() ? table.area.trim() : "Floor";
    map.set(key, [...(map.get(key) ?? []), table]);
  }
  return [...map.entries()];
}

type Context = { order: FloorOrder; table: FloorTable } | null;

function MoveDialog({ context, freeTables, onClose, onDone }: { context: Context; freeTables: FloorTable[]; onClose: () => void; onDone: () => void }) {
  const [tableId, setTableId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!context) return;
    setBusy(true);
    setError(null);
    try {
      const result = await moveOrder({ saleId: context.order.id, tableId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.number} moved to ${result.data.to}`);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={context !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move {context?.order.number}</DialogTitle>
          <DialogDescription>The whole order moves off {context?.table.name} to a free table.</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {freeTables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every table is occupied. Settle or merge one first.</p>
        ) : (
          <FormField label="Move to" htmlFor="move-table" required>
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger id="move-table" className="w-full">
                <SelectValue placeholder="Choose a table" />
              </SelectTrigger>
              <SelectContent>
                {freeTables.map((table) => (
                  <SelectItem key={table.id} value={table.id}>
                    {table.name}
                    {table.area ? ` · ${table.area}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !tableId}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Move order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  context,
  openOrders,
  onClose,
  onDone,
}: {
  context: Context;
  openOrders: { order: FloorOrder; table: FloorTable }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const format = useFormat();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = openOrders.filter((row) => row.order.id !== context?.order.id);

  async function submit() {
    if (!context) return;
    setBusy(true);
    setError(null);
    try {
      const result = await joinOrders({ sourceId: context.order.id, targetId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`Merged into ${result.data.number} — ${format.money(result.data.grandTotal)}`);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={context !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Merge {context?.order.number}</DialogTitle>
          <DialogDescription>Its items move onto the bill you choose, and {context?.order.number} is closed.</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FormField label="Merge into" htmlFor="merge-target" required>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger id="merge-target" className="w-full">
              <SelectValue placeholder="Choose an open bill" />
            </SelectTrigger>
            <SelectContent>
              {others.map(({ order, table }) => (
                <SelectItem key={order.id} value={order.id}>
                  {table.name} · {order.number} · {format.money(order.total)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !targetId}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitDialog({ context, onClose, onDone }: { context: Context; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={context !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split {context?.order.number}</DialogTitle>
          <DialogDescription>What you move goes onto a second bill on the same table, so each group can pay separately.</DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so the quantities always start from what is on the bill now. */}
        {context ? <SplitBody order={context.order} onClose={onClose} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SplitBody({ order, onClose, onDone }: { order: FloorOrder; onClose: () => void; onDone: () => void }) {
  const format = useFormat();
  const [taking, setTaking] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = order.lines;

  async function submit() {
    const chosen = lines
      .map((line) => ({ saleItemId: line.id, quantity: Math.min(line.quantity, Math.max(0, Number(taking[line.id]) || 0)) }))
      .filter((line) => line.quantity > 0);
    if (chosen.length === 0) {
      setError("Choose what moves to the second bill.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await divideOrder({ saleId: order.id, lines: chosen });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.splitNumber} opened for ${format.money(result.data.splitTotal)}`);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <ul className="divide-y">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format.number(line.quantity)} × {format.money(line.unitPrice)}
                  {line.modifiers.length > 0 ? ` · ${line.modifiers.join(", ")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Input
                  value={taking[line.id] ?? "0"}
                  onChange={(e) => setTaking((prev) => ({ ...prev, [line.id]: e.target.value }))}
                  inputMode="decimal"
                  className="h-9 w-20 text-center"
                  aria-label={`Move how many ${line.name}`}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => setTaking((prev) => ({ ...prev, [line.id]: String(line.quantity) }))}>
                  All
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || lines.length === 0}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Split the bill
        </Button>
      </DialogFooter>
    </>
  );
}
