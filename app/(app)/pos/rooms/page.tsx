import type { Metadata } from "next";
import { RoomsManager, type RoomView, type StayView } from "@/components/pos/rooms-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { listRooms, listStays } from "@/lib/data/industries";
import { listCustomerOptions } from "@/lib/data/parties";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisterItems } from "@/lib/data/pos";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "Rooms" };

/** The front desk: rooms, stays and each guest's folio. */
export default async function RoomsPage() {
  const auth = await requirePosCapability("ROOMS", "POS", "view");
  const [branch, format] = await Promise.all([getCurrentBranch(), getFormatters()]);
  const [rooms, stays, items, customers] = await Promise.all([
    listRooms(branch.id),
    listStays(branch.id),
    listRegisterItems(branch.id),
    listCustomerOptions(),
  ]);

  const roomViews: RoomView[] = rooms.map((room) => ({
    id: room.id,
    name: room.name,
    roomType: room.roomType,
    capacity: room.capacity,
    nightlyRate: room.nightlyRate,
    variantId: room.variantId,
    nightItemName: room.nightItemName,
    isActive: room.isActive,
    occupied: room.upcoming.some((stay) => stay.status === "CHECKED_IN"),
  }));

  const stayViews: StayView[] = stays.map((stay) => ({
    id: stay.id,
    number: stay.number,
    roomName: stay.roomName,
    guestName: stay.guestName,
    guestPhone: stay.guestPhone,
    checkInLabel: format.date(stay.checkIn),
    checkOutLabel: format.date(stay.checkOut),
    nights: stay.nights,
    nightlyRate: stay.nightlyRate,
    roomCharge: stay.roomCharge,
    guests: stay.guests,
    status: stay.status,
    folioNumber: stay.folioNumber,
    folioTotal: stay.folioTotal,
    folioLines: stay.folioLines,
    hasNightItem: Boolean(rooms.find((room) => room.id === stay.roomId)?.variantId),
  }));

  return (
    <>
      <PageHeader title="Rooms" description={`Stays at ${branch.name}. The folio is a held bill, and settling it checks the guest out.`} />
      <RoomsManager
        rooms={roomViews}
        stays={stayViews}
        services={items.map((item) => ({
          variantId: item.variantId,
          name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
          price: item.price,
        }))}
        customers={customers}
        canBook={auth.can("POS", "create")}
        canEdit={auth.can("POS", "edit")}
        canSetUp={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
