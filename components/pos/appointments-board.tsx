"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Loader2, Plus, Receipt, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { bookAppointment, moveAppointment } from "@/actions/staff";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/validation/staff";
import { cn } from "@/lib/utils";

export type AppointmentCard = {
  id: string;
  staffId: string;
  staffName: string;
  customerName: string;
  customerPhone: string | null;
  /** Pre-formatted on the server, so every screen reads the clock the same way. */
  startLabel: string;
  endLabel: string;
  minutes: number;
  status: keyof typeof APPOINTMENT_STATUS_LABELS;
  note: string | null;
  saleNumber: string | null;
  expected: number;
  items: { id: string; name: string; durationMinutes: number; price: number; staffName: string | null }[];
};

export type ServiceOption = { variantId: string; name: string; durationMinutes: number; price: number };

type Props = {
  date: string;
  appointments: AppointmentCard[];
  staff: { id: string; name: string }[];
  services: ServiceOption[];
  customers: { id: string; name: string }[];
  canBook: boolean;
  canEdit: boolean;
  canSell: boolean;
};

/**
 * One day's diary, by person. A booking only ever becomes money at the till, so the card's last
 * step is "take payment", which opens the register with the booking loaded.
 */
export function AppointmentsBoard({ date, appointments, staff, services, customers, canBook, canEdit, canSell }: Props) {
  const router = useRouter();
  const format = useFormat();
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const newButton = canBook ? (
    <Button onClick={() => setBooking(true)}>
      <Plus />
      New Booking
    </Button>
  ) : null;

  async function move(appointment: AppointmentCard, status: AppointmentCard["status"]) {
    setBusy(appointment.id);
    try {
      const result = await moveAppointment({ appointmentId: appointment.id, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.customerName}: ${APPOINTMENT_STATUS_LABELS[status].label.toLowerCase()}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const byStaff = staff
    .map((person) => ({ person, bookings: appointments.filter((appointment) => appointment.staffId === person.id) }))
    .filter((column) => column.bookings.length > 0 || staff.length <= 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/pos/appointments?date=${shiftDay(date, -1)}`)}>
            Previous day
          </Button>
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && router.push(`/pos/appointments?date=${e.target.value}`)}
            className="h-9 w-40"
            aria-label="Day shown"
          />
          <Button variant="outline" size="sm" onClick={() => router.push(`/pos/appointments?date=${shiftDay(date, 1)}`)}>
            Next day
          </Button>
        </div>
        {newButton}
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={User}
          title="No staff to book"
          description="Add the people who perform services first; a booking is always with someone."
          action={
            <Button asChild variant="outline">
              <a href="/pos/staff">Add staff</a>
            </Button>
          }
        />
      ) : appointments.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nothing booked for this day" description="Take a booking and it will appear here, by person." action={newButton} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {byStaff.map(({ person, bookings }) => (
            <section key={person.id} className="space-y-2">
              <h2 className="flex items-center justify-between text-sm font-medium tracking-wide text-muted-foreground uppercase">
                {person.name}
                <span className="tabular-nums">{bookings.length}</span>
              </h2>
              {bookings.length === 0 ? (
                <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">Free all day</p>
              ) : (
                bookings.map((appointment) => (
                  <Card key={appointment.id} className={cn(appointment.status === "CANCELLED" || appointment.status === "NO_SHOW" ? "opacity-60" : null)}>
                    <CardContent className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{appointment.customerName}</p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            {appointment.startLabel} – {appointment.endLabel} · {appointment.minutes} min
                          </p>
                        </div>
                        <StatusBadge tone={APPOINTMENT_STATUS_LABELS[appointment.status].tone}>
                          {APPOINTMENT_STATUS_LABELS[appointment.status].label}
                        </StatusBadge>
                      </div>

                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {appointment.items.map((item) => (
                          <li key={item.id} className="truncate">
                            {item.name} · {item.durationMinutes} min · {format.money(item.price)}
                            {item.staffName && item.staffName !== appointment.staffName ? ` · ${item.staffName}` : ""}
                          </li>
                        ))}
                      </ul>

                      {appointment.note ? <p className="rounded-md bg-muted px-2 py-1.5 text-xs">{appointment.note}</p> : null}

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-auto text-sm font-medium tabular-nums">{format.money(appointment.expected)}</span>
                        {appointment.saleNumber ? (
                          <span className="text-xs text-muted-foreground">Paid · {appointment.saleNumber}</span>
                        ) : (
                          <>
                            {canEdit && appointment.status === "BOOKED" ? (
                              <Button size="sm" variant="outline" disabled={busy === appointment.id} onClick={() => move(appointment, "CONFIRMED")}>
                                Confirm
                              </Button>
                            ) : null}
                            {canEdit && (appointment.status === "BOOKED" || appointment.status === "CONFIRMED") ? (
                              <Button size="sm" variant="outline" disabled={busy === appointment.id} onClick={() => move(appointment, "ARRIVED")}>
                                Arrived
                              </Button>
                            ) : null}
                            {canSell && appointment.status !== "CANCELLED" && appointment.status !== "NO_SHOW" ? (
                              <Button size="sm" onClick={() => router.push(`/pos/register?appointment=${appointment.id}`)}>
                                <Receipt />
                                Take payment
                              </Button>
                            ) : null}
                            {canEdit && appointment.status !== "CANCELLED" && appointment.status !== "NO_SHOW" ? (
                              <>
                                <Button size="sm" variant="ghost" disabled={busy === appointment.id} onClick={() => move(appointment, "NO_SHOW")}>
                                  No show
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label="Cancel booking"
                                  disabled={busy === appointment.id}
                                  onClick={() => move(appointment, "CANCELLED")}
                                >
                                  <Trash2 />
                                </Button>
                              </>
                            ) : null}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          ))}
        </div>
      )}

      <Dialog open={booking} onOpenChange={setBooking}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>Times and prices come from the service list; the day ends when the services do.</DialogDescription>
          </DialogHeader>
          {booking ? (
            <BookingForm
              date={date}
              staff={staff}
              services={services}
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
    </div>
  );
}

/** Day arithmetic on the "YYYY-MM-DD" the page is showing. */
function shiftDay(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Row = { key: string; variantId: string; staffId: string };

function BookingForm({
  date,
  staff,
  services,
  customers,
  onClose,
  onDone,
}: {
  date: string;
  staff: { id: string; name: string }[];
  services: ServiceOption[];
  customers: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const format = useFormat();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [day, setDay] = useState(date);
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ key: "row-0", variantId: "", staffId: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = rows.map((row) => services.find((service) => service.variantId === row.variantId)).filter((service): service is ServiceOption => Boolean(service));
  const minutes = chosen.reduce((sum, service) => sum + service.durationMinutes, 0);
  const price = chosen.reduce((sum, service) => sum + service.price, 0);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await bookAppointment({
        customerId: customerId || null,
        // A regular's name comes from their record; a walk-in just gives one.
        customerName: customerName.trim() || customers.find((c) => c.id === customerId)?.name || "",
        customerPhone: phone,
        staffId,
        date: day,
        time,
        note,
        items: rows.filter((row) => row.variantId).map((row) => ({ variantId: row.variantId, staffId: row.staffId || null })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(`Booked for ${result.data.minutes} minutes`);
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

        <FormField label="Customer" htmlFor="booking-customer" description="Pick a regular, or just type a name below.">
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
          <FormField label="Name on the booking" htmlFor="booking-name" required>
            <Input id="booking-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField label="Phone" htmlFor="booking-phone">
            <Input id="booking-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="With" htmlFor="booking-staff" required>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger id="booking-staff" className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Day" htmlFor="booking-day" required>
            <Input id="booking-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </FormField>
          <FormField label="Time" htmlFor="booking-time" required>
            <Input id="booking-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </FormField>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Services</p>
          {rows.map((row) => (
            <div key={row.key} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Combobox
                  options={services.map((service) => ({ value: service.variantId, label: `${service.name} · ${service.durationMinutes} min` }))}
                  value={row.variantId}
                  onChange={(value) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, variantId: value } : r)))}
                  placeholder="Choose a service"
                  searchPlaceholder="Search services…"
                />
              </div>
              <div className="w-36 shrink-0">
                <Select
                  value={row.staffId || "same"}
                  onValueChange={(value) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, staffId: value === "same" ? "" : value } : r)))}
                >
                  <SelectTrigger aria-label="Who does this service" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same">Same person</SelectItem>
                    {staff.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove service"
                onClick={() => setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== row.key)))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { key: `row-${Date.now()}`, variantId: "", staffId: "" }])}>
            <Plus />
            Add service
          </Button>
        </div>

        <FormField label="Note" htmlFor="booking-note">
          <Textarea id="booking-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </FormField>

        <p className="text-sm text-muted-foreground">
          {minutes > 0 ? (
            <>
              {minutes} minutes · <span className="font-medium tabular-nums">{format.money(price)}</span> expected
            </>
          ) : (
            "Choose a service to see how long it takes."
          )}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !staffId || chosen.length === 0 || !customerName.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Book it
        </Button>
      </DialogFooter>
    </>
  );
}
