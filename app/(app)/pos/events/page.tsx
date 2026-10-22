import type { Metadata } from "next";
import { EventsManager, type EventCard } from "@/components/pos/events-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { listTicketEvents } from "@/lib/data/industries";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisterItems } from "@/lib/data/pos";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "Events" };

/** Showings and sessions. Places count down as the till sells them. */
export default async function EventsPage() {
  const auth = await requirePosCapability("TICKETS", "INVENTORY", "view");
  const [branch, format] = await Promise.all([getCurrentBranch(), getFormatters()]);
  const [events, items] = await Promise.all([listTicketEvents(branch.id), listRegisterItems(branch.id)]);

  const cards: EventCard[] = events.map((event) => ({
    id: event.id,
    name: event.name,
    whenLabel: format.dateTime(event.startsAt),
    // The form edits the same wall-clock values the event was created with.
    date: event.startsAt.toISOString().slice(0, 10),
    time: event.startsAt.toISOString().slice(11, 16),
    endTime: event.endsAt ? event.endsAt.toISOString().slice(11, 16) : null,
    capacity: event.capacity,
    sold: event.sold,
    placesLeft: event.placesLeft,
    variantId: event.variantId,
    ticketName: event.ticketName,
    price: event.price,
    note: event.note,
    isActive: event.isActive,
  }));

  return (
    <>
      <PageHeader title="Events" description={`Showings at ${branch.name}. The till sells the ticket item, and the last place closes the event.`} />
      <EventsManager
        events={cards}
        // A ticket admits someone, so only services can sell one.
        tickets={items
          .filter((item) => item.kind === "SERVICE")
          .map((item) => ({
            variantId: item.variantId,
            name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
            price: item.price,
          }))}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
