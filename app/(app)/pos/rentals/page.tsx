import type { Metadata } from "next";
import { RentalsManager, type RentalCard } from "@/components/pos/rentals-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { daysLate } from "@/lib/business/rentals";
import { listRentals } from "@/lib/data/industries";
import { listCustomerOptions } from "@/lib/data/parties";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisterItems } from "@/lib/data/pos";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "Rentals" };

/** What is out, when it is back, and what the late days come to. */
export default async function RentalsPage() {
  const auth = await requirePosCapability("RENTALS", "POS", "view");
  const [branch, format] = await Promise.all([getCurrentBranch(), getFormatters()]);
  const [rentals, items, customers] = await Promise.all([listRentals(branch.id), listRegisterItems(branch.id), listCustomerOptions()]);
  // One clock, read on the server, so every screen counts the same late days.
  const now = new Date();

  const cards: RentalCard[] = rentals.map((rental) => ({
    id: rental.id,
    number: rental.number,
    customerName: rental.customerName,
    customerPhone: rental.customerPhone,
    itemName: rental.itemName,
    quantity: rental.quantity,
    dailyRate: rental.dailyRate,
    deposit: rental.deposit,
    outLabel: format.date(rental.outAt),
    dueLabel: format.date(rental.dueAt),
    returnedLabel: rental.returnedAt ? format.date(rental.returnedAt) : null,
    status: rental.status,
    lateFee: rental.lateFee,
    note: rental.note,
    daysLate: rental.returnedAt ? daysLate(rental.dueAt, rental.returnedAt) : daysLate(rental.dueAt, now),
  }));

  return (
    <>
      <PageHeader title="Rentals" description={`Kit out from ${branch.name}. It leaves the shelf when it goes and comes back when it returns.`} />
      <RentalsManager
        rentals={cards}
        items={items.map((item) => ({
          variantId: item.variantId,
          name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
          price: item.price,
          stock: item.stock,
        }))}
        customers={customers}
        canCreate={auth.can("POS", "create")}
        canEdit={auth.can("POS", "edit")}
      />
    </>
  );
}
