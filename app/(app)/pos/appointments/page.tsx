import type { Metadata } from "next";
import { AppointmentsBoard, type AppointmentCard } from "@/components/pos/appointments-board";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/data/parties";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisterItems } from "@/lib/data/pos";
import { today } from "@/lib/data/sales";
import { listAppointments, listStaff } from "@/lib/data/staff";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "Appointments" };

/** One day's diary. The day shown comes from `?date=`, defaulting to today. */
export default async function AppointmentsPage({ searchParams }: PageProps<"/pos/appointments">) {
  const auth = await requirePosCapability("APPOINTMENTS", "POS_BOOKINGS", "view");
  const [branch, todayDate, raw, format] = await Promise.all([getCurrentBranch(), today(), searchParams, getFormatters()]);

  const asked = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : todayDate;
  const [appointments, staff, items, customers] = await Promise.all([
    listAppointments(branch.id, asked),
    listStaff(branch.id, { activeOnly: true }),
    listRegisterItems(branch.id),
    listCustomerOptions(),
  ]);

  const cards: AppointmentCard[] = appointments.map((appointment) => ({
    id: appointment.id,
    staffId: appointment.staffId,
    staffName: appointment.staffName,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    // The clock is read on the server, through the company's regional settings.
    startLabel: format.dateTime(appointment.startAt).slice(-5),
    endLabel: format.dateTime(appointment.endAt).slice(-5),
    minutes: appointment.minutes,
    status: appointment.status,
    note: appointment.note,
    saleNumber: appointment.saleNumber,
    expected: appointment.expected,
    items: appointment.items.map((item) => ({
      id: item.id,
      name: item.name,
      durationMinutes: item.durationMinutes,
      price: item.price,
      staffName: item.staffName,
    })),
  }));

  return (
    <>
      <PageHeader title="Appointments" description={`Bookings at ${branch.name}. A booking becomes money only when it is paid for at the till.`} />
      <AppointmentsBoard
        date={asked}
        appointments={cards}
        staff={staff.map((person) => ({ id: person.id, name: person.name }))}
        // Only services can be booked: a bottle of shampoo takes no time.
        services={items
          .filter((item) => item.kind === "SERVICE")
          .map((item) => ({
            variantId: item.variantId,
            name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
            durationMinutes: item.durationMinutes ?? 30,
            price: item.price,
          }))}
        customers={customers}
        canBook={auth.can("POS", "create")}
        canEdit={auth.can("POS", "edit")}
        canSell={auth.can("POS", "create")}
      />
    </>
  );
}
