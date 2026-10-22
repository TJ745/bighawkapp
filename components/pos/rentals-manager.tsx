"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, PackageOpen, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { rentOut, returnRental } from "@/actions/industries";
import { RENTAL_STATUS_LABELS } from "@/lib/validation/industries";

export type RentalCard = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string | null;
  itemName: string;
  quantity: number;
  dailyRate: number;
  deposit: number;
  outLabel: string;
  dueLabel: string;
  returnedLabel: string | null;
  status: keyof typeof RENTAL_STATUS_LABELS;
  lateFee: number;
  note: string | null;
  /** Days past due, worked out server-side so every screen agrees. */
  daysLate: number;
};

type Props = {
  rentals: RentalCard[];
  items: { variantId: string; name: string; price: number; stock: number | null }[];
  customers: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
};

/** What is out, when it is due back, and what the late days have come to. */
export function RentalsManager({ rentals, items, customers, canCreate, canEdit }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [out, setOut] = useState(false);
  const [returning, setReturning] = useState<RentalCard | null>(null);

  const newButton = canCreate ? (
    <Button onClick={() => setOut(true)}>
      <Plus />
      Lend Something Out
    </Button>
  ) : null;

  const live = rentals.filter((rental) => rental.status === "OUT" || rental.status === "OVERDUE");
  const closed = rentals.filter((rental) => rental.status === "RETURNED" || rental.status === "LOST");

  return (
    <div className="space-y-4">
      {rentals.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nothing out on rental"
          description="Lend something out and it leaves the shelf here, with a due date and a late fee if it comes back late."
          action={newButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{newButton}</div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((rental) => (
              <Card key={rental.id} className={rental.status === "OVERDUE" ? "border-tint-red-foreground/40" : undefined}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{rental.itemName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rental.number} · {rental.customerName}
                        {rental.customerPhone ? ` · ${rental.customerPhone}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone={RENTAL_STATUS_LABELS[rental.status].tone}>{RENTAL_STATUS_LABELS[rental.status].label}</StatusBadge>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1">
                      <Clock className="size-3" />
                      Due {rental.dueLabel}
                      {rental.daysLate > 0 ? ` · ${rental.daysLate} day${rental.daysLate === 1 ? "" : "s"} late` : ""}
                    </p>
                    <p>
                      {format.number(rental.quantity)} × {format.money(rental.dailyRate)} a day
                      {rental.deposit > 0 ? ` · ${format.money(rental.deposit)} deposit` : ""}
                    </p>
                    {rental.note ? <p className="rounded-md bg-muted px-2 py-1.5">{rental.note}</p> : null}
                  </div>

                  {canEdit ? (
                    <Button size="sm" onClick={() => setReturning(rental)}>
                      <Undo2 />
                      Take it back
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {closed.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Closed</h2>
              <div className="flex flex-wrap gap-2">
                {closed.slice(0, 20).map((rental) => (
                  <span key={rental.id} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground">
                    {rental.number} · {rental.itemName} · {RENTAL_STATUS_LABELS[rental.status].label}
                    {rental.lateFee > 0 ? ` · late fee ${format.money(rental.lateFee)}` : ""}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <Dialog open={out} onOpenChange={setOut}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lend something out</DialogTitle>
            <DialogDescription>The kit leaves the shelf now. Take the days agreed at the till, like any other sale.</DialogDescription>
          </DialogHeader>
          {out ? (
            <OutForm
              items={items}
              customers={customers}
              onClose={() => setOut(false)}
              onDone={() => {
                setOut(false);
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ReturnDialog
        rental={returning}
        onClose={() => setReturning(null)}
        onDone={() => {
          setReturning(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function OutForm({
  items,
  customers,
  onClose,
  onDone,
}: {
  items: { variantId: string; name: string; price: number; stock: number | null }[];
  customers: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const format = useFormat();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [days, setDays] = useState("1");
  const [rate, setRate] = useState("");
  const [deposit, setDeposit] = useState("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = items.find((row) => row.variantId === variantId);
  const effectiveRate = rate.trim() === "" ? (item?.price ?? 0) : Number(rate) || 0;
  const expected = effectiveRate * (Number(quantity) || 0) * (Number(days) || 0);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await rentOut({
        customerId: customerId || null,
        customerName: customerName.trim() || customers.find((c) => c.id === customerId)?.name || "",
        customerPhone: phone,
        variantId,
        quantity: Number(quantity),
        days: Number(days),
        dailyRate: rate.trim() === "" ? null : Number(rate),
        deposit: Number(deposit) || 0,
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.number} out for ${result.data.days} day${result.data.days === 1 ? "" : "s"}`);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormField label="Customer" htmlFor="rent-customer" description="Pick a regular, or just type a name below.">
          <Combobox
            options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value);
              const found = customers.find((customer) => customer.id === value);
              if (found) setCustomerName(found.name);
            }}
            placeholder="Walk-in"
            searchPlaceholder="Search customers…"
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name on the rental" htmlFor="rent-name" required>
            <Input id="rent-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Phone" htmlFor="rent-phone">
            <Input id="rent-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </FormField>
        </div>

        <FormField label="What is going out" htmlFor="rent-item" required>
          <Combobox
            options={items.map((row) => ({ value: row.variantId, label: row.stock === null ? row.name : `${row.name} · ${row.stock} in` }))}
            value={variantId}
            onChange={setVariantId}
            placeholder="Choose an item"
            searchPlaceholder="Search the catalogue…"
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-4">
          <FormField label="How many" htmlFor="rent-qty" required>
            <Input id="rent-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
          </FormField>
          <FormField label="Days" htmlFor="rent-days" required>
            <Input id="rent-days" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Per day" htmlFor="rent-rate" description="Blank uses the price.">
            <Input id="rent-rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
          </FormField>
          <FormField label="Deposit" htmlFor="rent-deposit">
            <Input id="rent-deposit" value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" />
          </FormField>
        </div>

        <FormField label="Note" htmlFor="rent-note">
          <Textarea id="rent-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>

        <p className="text-sm text-muted-foreground">
          The days agreed come to <span className="font-medium tabular-nums">{format.money(expected)}</span>, charged at the till.
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !customerName.trim() || !variantId}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Send it out
        </Button>
      </DialogFooter>
    </>
  );
}

function ReturnDialog({ rental, onClose, onDone }: { rental: RentalCard | null; onClose: () => void; onDone: () => void }) {
  const format = useFormat();
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!rental) return;
    setBusy(true);
    setError(null);
    try {
      const result = await returnRental({ rentalId: rental.id, lost });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(
        result.data.lost
          ? `${result.data.number} written off`
          : result.data.lateFee > 0
            ? `${result.data.number} back — ${format.money(result.data.lateFee)} to charge for ${result.data.daysLate} late day${result.data.daysLate === 1 ? "" : "s"}`
            : `${result.data.number} back on time`,
      );
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={rental !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Take back {rental?.itemName}</DialogTitle>
          <DialogDescription>
            {rental && rental.daysLate > 0
              ? `${rental.daysLate} day${rental.daysLate === 1 ? "" : "s"} late — the fee is worked out here and charged at the till.`
              : "Back on time. The kit goes straight back on the shelf."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <SettingSwitchRow
          label="Not coming back"
          description="Written off as lost: it does not return to the shelf, and the deposit covers it."
          checked={lost}
          onCheckedChange={setLost}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {lost ? "Write it off" : "It is back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
