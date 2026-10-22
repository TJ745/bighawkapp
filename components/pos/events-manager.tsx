"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Pencil, Plus } from "lucide-react";
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
import { createTicketEvent, updateTicketEvent } from "@/actions/industries";
import { cn } from "@/lib/utils";

export type EventCard = {
  id: string;
  name: string;
  /** Pre-formatted on the server so every screen reads the clock the same way. */
  whenLabel: string;
  date: string;
  time: string;
  endTime: string | null;
  capacity: number;
  sold: number;
  placesLeft: number;
  variantId: string;
  ticketName: string;
  price: number;
  note: string | null;
  isActive: boolean;
};

type Props = {
  events: EventCard[];
  tickets: { variantId: string; name: string; price: number }[];
  canCreate: boolean;
  canEdit: boolean;
};

/** Showings and sessions, with how many places are left. Selling is done at the till. */
export function EventsManager({ events, tickets, canCreate, canEdit }: Props) {
  const format = useFormat();
  const [editing, setEditing] = useState<EventCard | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canCreate ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Event
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events yet"
          description="An event has a time and a number of places. The till sells its ticket item and the places count down."
          action={newButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{newButton}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const full = event.placesLeft === 0;
              return (
                <Card key={event.id} className={cn(!event.isActive && "opacity-60", full && event.isActive && "border-tint-amber-foreground/40")}>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{event.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{event.whenLabel}</p>
                      </div>
                      <StatusBadge tone={!event.isActive ? "neutral" : full ? "danger" : "success"}>
                        {!event.isActive ? "Off sale" : full ? "Sold out" : `${event.placesLeft} left`}
                      </StatusBadge>
                    </div>

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        {event.sold} of {event.capacity} places sold
                      </p>
                      <p>
                        {event.ticketName} · {format.money(event.price)}
                      </p>
                      {event.note ? <p className="rounded-md bg-muted px-2 py-1.5">{event.note}</p> : null}
                    </div>

                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(event);
                          setOpen(true);
                        }}
                      >
                        <Pencil />
                        Edit
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? editing.name : "New event"}</DialogTitle>
            <DialogDescription>
              Capacity can grow, but never below what has already been sold — and the ticket item is fixed once anybody has one.
            </DialogDescription>
          </DialogHeader>
          {open ? <EventForm event={editing} tickets={tickets} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventForm({ event, tickets, onClose }: { event: EventCard | null; tickets: { variantId: string; name: string; price: number }[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(event?.name ?? "");
  const [variantId, setVariantId] = useState(event?.variantId ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  const [time, setTime] = useState(event?.time ?? "19:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [capacity, setCapacity] = useState(String(event?.capacity ?? 50));
  const [note, setNote] = useState(event?.note ?? "");
  const [isActive, setIsActive] = useState(event?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload = { name, variantId, date, time, endTime: endTime || null, capacity: Number(capacity), note, isActive };
      const result = event ? await updateTicketEvent(event.id, payload) : await createTicketEvent(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(event ? "Event saved" : "Event added");
      onClose();
      router.refresh();
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

        <FormField label="Name" htmlFor="event-name" required>
          <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Evening screening" autoComplete="off" />
        </FormField>

        <FormField label="Ticket item" htmlFor="event-item" required description="What the till rings up for one place.">
          <Combobox
            options={tickets.map((ticket) => ({ value: ticket.variantId, label: ticket.name }))}
            value={variantId}
            onChange={setVariantId}
            placeholder="Choose a ticket"
            searchPlaceholder="Search services…"
            disabled={Boolean(event && event.sold > 0)}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Date" htmlFor="event-date" required>
            <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Starts" htmlFor="event-time" required>
            <Input id="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </FormField>
          <FormField label="Ends" htmlFor="event-end">
            <Input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Places" htmlFor="event-capacity" required description={event ? `${event.sold} already sold.` : "How many people fit."}>
          <Input id="event-capacity" value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" />
        </FormField>

        <FormField label="Note" htmlFor="event-note">
          <Textarea id="event-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>

        <SettingSwitchRow label="On sale" description="Taking it off sale stops the till offering it; places already sold stay sold." checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !name.trim() || !variantId || !date}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {event ? "Save changes" : "Add the event"}
        </Button>
      </DialogFooter>
    </>
  );
}
