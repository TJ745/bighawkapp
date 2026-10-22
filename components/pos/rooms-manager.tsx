"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Loader2, LogIn, Pencil, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingSwitchRow } from "@/components/settings/setting-switch-row";
import { useFormat } from "@/components/providers/format-provider";
import { bookStay, chargeToFolio, createRoom, moveStay, updateRoom } from "@/actions/industries";
import { STAY_STATUS_LABELS } from "@/lib/validation/industries";
import { cn } from "@/lib/utils";

export type RoomView = {
  id: string;
  name: string;
  roomType: string | null;
  capacity: number;
  nightlyRate: number;
  variantId: string | null;
  nightItemName: string | null;
  isActive: boolean;
  occupied: boolean;
};

export type StayView = {
  id: string;
  number: string;
  roomName: string;
  guestName: string;
  guestPhone: string | null;
  checkInLabel: string;
  checkOutLabel: string;
  nights: number;
  nightlyRate: number;
  roomCharge: number;
  guests: number;
  status: keyof typeof STAY_STATUS_LABELS;
  folioNumber: string | null;
  folioTotal: number;
  folioLines: number;
  hasNightItem: boolean;
};

type Props = {
  rooms: RoomView[];
  stays: StayView[];
  services: { variantId: string; name: string; price: number }[];
  customers: { id: string; name: string }[];
  canBook: boolean;
  canEdit: boolean;
  canSetUp: boolean;
};

/** The front desk: rooms, who is in them, and what each guest owes so far. */
export function RoomsManager({ rooms, stays, services, customers, canBook, canEdit, canSetUp }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [roomOpen, setRoomOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomView | null>(null);
  const [booking, setBooking] = useState(false);
  const [charging, setCharging] = useState<StayView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function move(stay: StayView, status: StayView["status"]) {
    setBusy(stay.id);
    try {
      const result = await moveStay({ stayId: stay.id, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.number}: ${STAY_STATUS_LABELS[status].label.toLowerCase()}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        {canSetUp ? (
          <Button
            variant="outline"
            onClick={() => {
              setEditingRoom(null);
              setRoomOpen(true);
            }}
          >
            <Plus />
            New Room
          </Button>
        ) : null}
        {canBook && rooms.length > 0 ? (
          <Button onClick={() => setBooking(true)}>
            <Plus />
            Book a Room
          </Button>
        ) : null}
      </div>

      {rooms.length === 0 ? (
        <EmptyState icon={BedDouble} title="No rooms yet" description="Add the rooms at this branch, with what a night costs, and they appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rooms.map((room) => (
            <Card key={room.id} className={cn(!room.isActive && "opacity-60", room.occupied && "border-primary/40 bg-sidebar-accent/40")}>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{room.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {room.roomType ?? "Room"} · sleeps {room.capacity}
                    </p>
                  </div>
                  <StatusBadge tone={!room.isActive ? "neutral" : room.occupied ? "info" : "success"}>
                    {!room.isActive ? "Closed" : room.occupied ? "Occupied" : "Free"}
                  </StatusBadge>
                </div>
                <p className="text-sm font-medium tabular-nums">{format.money(room.nightlyRate)} a night</p>
                {!room.nightItemName ? <p className="text-xs text-tint-amber-foreground">No night item: nights are charged by hand.</p> : null}
                {canSetUp ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingRoom(room);
                      setRoomOpen(true);
                    }}
                  >
                    <Pencil />
                    Edit
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stays</CardTitle>
          <CardDescription>The folio is a held bill: charges land on it from anywhere, and settling it checks the guest out.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead className="hidden sm:table-cell">Room</TableHead>
                <TableHead className="hidden md:table-cell">Dates</TableHead>
                <TableHead className="text-right">Folio</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nobody booked in yet.
                  </TableCell>
                </TableRow>
              ) : (
                stays.map((stay) => (
                  <TableRow key={stay.id}>
                    <TableCell>
                      <p className="font-medium">{stay.guestName}</p>
                      <p className="text-xs text-muted-foreground">
                        {stay.number}
                        {stay.guestPhone ? ` · ${stay.guestPhone}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{stay.roomName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {stay.checkInLabel} → {stay.checkOutLabel}
                      <span className="block text-xs">
                        {stay.nights} night{stay.nights === 1 ? "" : "s"} · room {format.money(stay.roomCharge)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {stay.folioNumber ? (
                        <>
                          {format.money(stay.folioTotal)}
                          <span className="block text-xs text-muted-foreground">
                            {stay.folioNumber} · {stay.folioLines} lines
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Nothing yet</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STAY_STATUS_LABELS[stay.status].tone}>{STAY_STATUS_LABELS[stay.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canEdit && stay.status === "BOOKED" ? (
                          <Button size="sm" variant="outline" disabled={busy === stay.id} onClick={() => move(stay, "CHECKED_IN")}>
                            <LogIn />
                            Check in
                          </Button>
                        ) : null}
                        {canBook && (stay.status === "BOOKED" || stay.status === "CHECKED_IN") ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setCharging(stay)}>
                              Charge
                            </Button>
                            <Button size="sm" disabled={!stay.folioNumber} onClick={() => router.push(`/pos/register?stay=${stay.id}&pay=1`)}>
                              <Receipt />
                              Check out
                            </Button>
                          </>
                        ) : null}
                        {canEdit && stay.status === "BOOKED" ? (
                          <Button size="sm" variant="ghost" disabled={busy === stay.id} onClick={() => move(stay, "NO_SHOW")}>
                            No show
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? `Edit ${editingRoom.name}` : "New room"}</DialogTitle>
            <DialogDescription>The night item is what charges a night, so it goes through the catalogue like everything else.</DialogDescription>
          </DialogHeader>
          {roomOpen ? <RoomForm room={editingRoom} services={services} onClose={() => setRoomOpen(false)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={booking} onOpenChange={setBooking}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Book a room</DialogTitle>
            <DialogDescription>The night of departure is not charged, so one night is in today and out tomorrow.</DialogDescription>
          </DialogHeader>
          {booking ? (
            <BookForm
              rooms={rooms.filter((room) => room.isActive)}
              customers={customers}
              onClose={() => setBooking(false)}
              onDone={() => {
                setBooking(false);
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={charging !== null} onOpenChange={(open) => !open && setCharging(null)}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Charge to {charging?.roomName}</DialogTitle>
            <DialogDescription>What you add lands on the folio, priced from the catalogue, and is settled at check-out.</DialogDescription>
          </DialogHeader>
          {charging ? (
            <ChargeForm
              stay={charging}
              services={services}
              onClose={() => setCharging(null)}
              onDone={() => {
                setCharging(null);
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomForm({ room, services, onClose }: { room: RoomView | null; services: { variantId: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(room?.name ?? "");
  const [roomType, setRoomType] = useState(room?.roomType ?? "");
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 2));
  const [rate, setRate] = useState(String(room?.nightlyRate ?? 0));
  const [variantId, setVariantId] = useState(room?.variantId ?? "");
  const [isActive, setIsActive] = useState(room?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("roomType", roomType);
      formData.set("capacity", capacity);
      formData.set("nightlyRate", rate);
      formData.set("variantId", variantId);
      formData.set("isActive", String(isActive));
      const result = room ? await updateRoom(room.id, formData) : await createRoom(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(room ? "Room saved" : "Room added");
      onClose();
      router.refresh();
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
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name" htmlFor="room-name" required>
            <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="101" autoComplete="off" />
          </FormField>
          <FormField label="Type" htmlFor="room-type">
            <Input id="room-type" value={roomType} onChange={(e) => setRoomType(e.target.value)} placeholder="Double" autoComplete="off" />
          </FormField>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Sleeps" htmlFor="room-capacity" required>
            <Input id="room-capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Per night" htmlFor="room-rate" required>
            <Input id="room-rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
          </FormField>
        </div>
        <FormField label="Night item" htmlFor="room-item" description="The service charged for a night. Without one, nights are added by hand.">
          <Combobox
            options={services.map((service) => ({ value: service.variantId, label: service.name }))}
            value={variantId}
            onChange={setVariantId}
            placeholder="None"
            searchPlaceholder="Search services…"
          />
        </FormField>
        <SettingSwitchRow
          label="In use"
          description="A room with somebody booked in cannot be closed until the stay is moved."
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {room ? "Save changes" : "Add the room"}
        </Button>
      </DialogFooter>
    </>
  );
}

function BookForm({
  rooms,
  customers,
  onClose,
  onDone,
}: {
  rooms: RoomView[];
  customers: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const format = useFormat();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [customerId, setCustomerId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("1");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const room = rooms.find((r) => r.id === roomId);
  const nights =
    checkIn && checkOut
      ? Math.max(1, Math.round((new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86_400_000))
      : 0;
  const effectiveRate = rate.trim() === "" ? (room?.nightlyRate ?? 0) : Number(rate) || 0;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await bookStay({
        roomId,
        customerId: customerId || null,
        guestName: guestName.trim() || customers.find((c) => c.id === customerId)?.name || "",
        guestPhone: phone,
        checkIn,
        checkOut,
        guests: Number(guests) || 1,
        nightlyRate: rate.trim() === "" ? null : Number(rate),
        note,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.number} booked for ${result.data.nights} night${result.data.nights === 1 ? "" : "s"}`);
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

        <FormField label="Room" htmlFor="stay-room" required>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger id="stay-room" className="w-full">
              <SelectValue placeholder="Choose a room" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name} · sleeps {option.capacity} · {format.money(option.nightlyRate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Customer" htmlFor="stay-customer" description="Pick a regular, or just type a name below.">
          <Combobox
            options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value);
              const found = customers.find((customer) => customer.id === value);
              if (found) setGuestName(found.name);
            }}
            placeholder="Walk-in"
            searchPlaceholder="Search customers…"
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Guest name" htmlFor="stay-guest" required>
            <Input id="stay-guest" value={guestName} onChange={(e) => setGuestName(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Phone" htmlFor="stay-phone">
            <Input id="stay-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-4">
          <FormField label="Arrives" htmlFor="stay-in" required>
            <Input id="stay-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </FormField>
          <FormField label="Leaves" htmlFor="stay-out" required>
            <Input id="stay-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </FormField>
          <FormField label="Guests" htmlFor="stay-guests">
            <Input id="stay-guests" value={guests} onChange={(e) => setGuests(e.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Per night" htmlFor="stay-rate" description="Blank uses the room's rate.">
            <Input id="stay-rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
          </FormField>
        </div>

        <FormField label="Note" htmlFor="stay-note">
          <Textarea id="stay-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>

        {nights > 0 ? (
          <p className="text-sm text-muted-foreground">
            {nights} night{nights === 1 ? "" : "s"} · the room comes to <span className="font-medium tabular-nums">{format.money(nights * effectiveRate)}</span>.
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !roomId || !guestName.trim() || !checkIn || !checkOut}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Book it
        </Button>
      </DialogFooter>
    </>
  );
}

type ChargeRow = { key: string; variantId: string; quantity: string };

function ChargeForm({
  stay,
  services,
  onClose,
  onDone,
}: {
  stay: StayView;
  services: { variantId: string; name: string; price: number }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const format = useFormat();
  const [includeNights, setIncludeNights] = useState(false);
  const [rows, setRows] = useState<ChargeRow[]>([{ key: "row-0", variantId: "", quantity: "1" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await chargeToFolio({
        stayId: stay.id,
        includeNights,
        lines: rows
          .filter((row) => row.variantId && Number(row.quantity) > 0)
          .map((row) => ({ variantId: row.variantId, quantity: Number(row.quantity) })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`${result.data.folioNumber} now ${format.money(result.data.total)}`);
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

        <p className="text-sm text-muted-foreground">
          {stay.folioNumber ? (
            <>
              Folio {stay.folioNumber} stands at <span className="font-medium tabular-nums">{format.money(stay.folioTotal)}</span>.
            </>
          ) : (
            "Nothing has been charged to this room yet."
          )}
        </p>

        <SettingSwitchRow
          label={`Charge the ${stay.nights} night${stay.nights === 1 ? "" : "s"}`}
          description={
            stay.hasNightItem
              ? `${stay.nights} × ${format.money(stay.nightlyRate)} for the room itself.`
              : "This room has no night item, so the nights cannot be added automatically."
          }
          checked={includeNights}
          onCheckedChange={setIncludeNights}
          disabled={!stay.hasNightItem}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium">Other charges</p>
          {rows.map((row) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Combobox
                  options={services.map((service) => ({ value: service.variantId, label: `${service.name} · ${format.money(service.price)}` }))}
                  value={row.variantId}
                  onChange={(value) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, variantId: value } : r)))}
                  placeholder="Choose something"
                  searchPlaceholder="Search the catalogue…"
                />
              </div>
              <div className="w-24 shrink-0">
                <Input
                  value={row.quantity}
                  onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)))}
                  inputMode="decimal"
                  aria-label="How many"
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { key: `row-${Date.now()}`, variantId: "", quantity: "1" }])}>
            <Plus />
            Add a line
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || (!includeNights && rows.every((row) => !row.variantId))}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Charge it
        </Button>
      </DialogFooter>
    </>
  );
}
