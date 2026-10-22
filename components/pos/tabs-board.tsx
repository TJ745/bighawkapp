"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, Receipt, Scissors, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { useFormat } from "@/components/providers/format-provider";
import { divideOrder } from "@/actions/tables";

export type TabCard = {
  id: string;
  number: string;
  name: string;
  total: number;
  itemCount: number;
  openedAgo: string;
  customerName: string | null;
  lines: { id: string; name: string; quantity: number; unitPrice: number; modifiers: string[] }[];
};

type Props = {
  tabs: TabCard[];
  canSell: boolean;
  canSplit: boolean;
};

/**
 * Open tabs at a bar: a bill running under someone's name, carried across rounds and settled at
 * the end. The same held sale a table uses, without the table.
 */
export function TabsBoard({ tabs, canSell, canSplit }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [splitting, setSplitting] = useState<TabCard | null>(null);

  const openTab = (
    <Button
      disabled={!canSell}
      onClick={() => {
        setName("");
        setNaming(true);
      }}
    >
      Open a tab
    </Button>
  );

  return (
    <div className="space-y-4">
      {tabs.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No tabs open"
          description="Start a tab under a customer's name and add rounds to it until they settle up."
          action={openTab}
        />
      ) : (
        <>
          <div className="flex justify-end">{openTab}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tabs.map((tab) => (
              <Card key={tab.id}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{tab.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tab.number} · {tab.itemCount} {tab.itemCount === 1 ? "item" : "items"}
                        {tab.customerName ? ` · ${tab.customerName}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{format.money(tab.total)}</span>
                      <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {tab.openedAgo}
                      </span>
                    </span>
                  </div>

                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {tab.lines.slice(0, 4).map((line) => (
                      <li key={line.id} className="truncate">
                        {format.number(line.quantity)}× {line.name}
                        {line.modifiers.length > 0 ? ` (${line.modifiers.join(", ")})` : ""}
                      </li>
                    ))}
                    {tab.lines.length > 4 ? <li>and {tab.lines.length - 4} more…</li> : null}
                  </ul>

                  <div className="flex flex-wrap gap-1.5">
                    {canSell ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => router.push(`/pos/register?order=${tab.id}`)}>
                          Add a round
                        </Button>
                        <Button size="sm" onClick={() => router.push(`/pos/register?order=${tab.id}&pay=1`)}>
                          <Receipt />
                          Settle up
                        </Button>
                      </>
                    ) : null}
                    {canSplit ? (
                      <Button size="sm" variant="ghost" aria-label={`Split ${tab.name}`} disabled={tab.itemCount < 2} onClick={() => setSplitting(tab)}>
                        <Scissors />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Naming the tab is all it takes to start one; the bill opens with the first round. */}
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Open a tab</DialogTitle>
            <DialogDescription>Give it a name the bar will recognise. The tab opens when the first round is added.</DialogDescription>
          </DialogHeader>
          <FormField label="Name on the tab" htmlFor="tab-name" required>
            <Input id="tab-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmed, table by the window…" autoComplete="off" />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={() => router.push(`/pos/register?tab=${encodeURIComponent(name.trim())}`)}>
              <Users />
              Start the order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SplitTabDialog
        tab={splitting}
        onClose={() => setSplitting(null)}
        onDone={() => {
          setSplitting(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function SplitTabDialog({ tab, onClose, onDone }: { tab: TabCard | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split {tab?.name}</DialogTitle>
          <DialogDescription>What you move goes onto a second tab, so one person can pay for part of the round.</DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so the quantities start from what is on the tab now. */}
        {tab ? <SplitTabBody tab={tab} onClose={onClose} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SplitTabBody({ tab, onClose, onDone }: { tab: TabCard; onClose: () => void; onDone: () => void }) {
  const format = useFormat();
  const [taking, setTaking] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const chosen = tab.lines
      .map((line) => ({ saleItemId: line.id, quantity: Math.min(line.quantity, Math.max(0, Number(taking[line.id]) || 0)) }))
      .filter((line) => line.quantity > 0);
    if (chosen.length === 0) {
      setError("Choose what moves to the second tab.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await divideOrder({ saleId: tab.id, lines: chosen });
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
          {tab.lines.map((line) => (
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
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Split the tab
        </Button>
      </DialogFooter>
    </>
  );
}
