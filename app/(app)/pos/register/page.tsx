import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RegisterScreen } from "@/components/pos/register-screen";
import { requireModule } from "@/lib/auth/session";
import { listItemCategories } from "@/lib/data/items";
import { listCustomerOptions } from "@/lib/data/parties";
import { getCurrentBranch } from "@/lib/data/platform";
import { listItemModifiers } from "@/lib/data/modifiers";
import { listParkedSales, listRegisterItems, listRegisters } from "@/lib/data/pos";
import { getOrder, listTables } from "@/lib/data/tables";
import { getAppointment, listStaff } from "@/lib/data/staff";
import { listMemberships } from "@/lib/data/memberships";
import { getStay, getWorkOrder, listTicketEvents } from "@/lib/data/industries";
import { getFormatters } from "@/lib/settings/formatters";
import { today } from "@/lib/data/sales";
import { getAppSettings, listPaymentAccounts } from "@/lib/data/settings";
import { posTypeHasCapability, posTypeLabel } from "@/lib/platform/pos-types";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: PageProps<"/pos/register">) {
  const auth = await requireModule("POS", "POS", "create");
  const [branch, formatters, todayDate] = await Promise.all([getCurrentBranch(), getFormatters(), today()]);
  const posType = branch.posConfig?.businessType ?? "RETAIL";
  const asksQuestions = posTypeHasCapability(posType, "MODIFIERS");
  // A shop that scans wants the scan box ready; a salon wants to tap a service instead.
  const scansCodes = posTypeHasCapability(posType, "BARCODE");
  const servesTables = posTypeHasCapability(posType, "TABLES");
  const cooksToOrder = posTypeHasCapability(posType, "KITCHEN");
  const runsTabs = posTypeHasCapability(posType, "TABS");
  const callsNumbers = posTypeHasCapability(posType, "QUICK_ORDER");
  const books = posTypeHasCapability(posType, "APPOINTMENTS");
  const paysCommission = posTypeHasCapability(posType, "STAFF_COMMISSION");
  const hasMemberships = posTypeHasCapability(posType, "MEMBERSHIPS");
  const hasPriceLists = posTypeHasCapability(posType, "PRICE_LISTS");
  const takesJobs = posTypeHasCapability(posType, "WORK_ORDERS");
  const sellsTickets = posTypeHasCapability(posType, "TICKETS");
  const hasRooms = posTypeHasCapability(posType, "ROOMS");
  const [items, categories, customers, registers, parked, accounts, settings, itemModifiers, staff, members, events] = await Promise.all([
    listRegisterItems(branch.id),
    listItemCategories({ activeOnly: true }),
    listCustomerOptions(),
    listRegisters(branch.id, { activeOnly: true }),
    listParkedSales(branch.id),
    listPaymentAccounts({ activeOnly: true }),
    getAppSettings(),
    asksQuestions ? listItemModifiers() : Promise.resolve({}),
    paysCommission ? listStaff(branch.id, { activeOnly: true }) : Promise.resolve([]),
    hasMemberships ? listMemberships(branch.id, todayDate, { activeOnly: true }) : Promise.resolve([]),
    sellsTickets ? listTicketEvents(branch.id, { upcomingOnly: true }) : Promise.resolve([]),
  ]);

  /**
   * An open bill arrives here as a link: `?order=` picks one back up, `?table=` starts a dine-in
   * order, `?tab=` starts a named bar tab. All three are re-checked against this branch and its
   * industry, because a URL is a request, not permission.
   */
  const { order: orderId, table: tableId, tab: tabParam, appointment: appointmentId, job: jobId, stay: stayId, guests, pay } = await searchParams;
  /**
   * A job or a folio arrives the same way a booking does: as a link the page re-checks against
   * this branch and its industry, because a URL is a request, not permission.
   */
  const jobToPay = takesJobs && typeof jobId === "string" ? await getWorkOrder(jobId, branch.id) : null;
  const openJob = jobToPay && !jobToPay.saleId && jobToPay.status !== "CANCELLED" ? jobToPay : null;
  const stayToSettle = hasRooms && typeof stayId === "string" ? await getStay(stayId, branch.id) : null;
  const openStay = stayToSettle && stayToSettle.folioId && (stayToSettle.status === "BOOKED" || stayToSettle.status === "CHECKED_IN") ? stayToSettle : null;
  const booking = books && typeof appointmentId === "string" ? await getAppointment(appointmentId, branch.id) : null;
  const bookingOpen = booking && !booking.saleId ? booking : null;
  const order = (servesTables || runsTabs) && typeof orderId === "string" ? await getOrder(orderId, branch.id) : null;
  const seatedTable =
    servesTables && !order && typeof tableId === "string" ? (await listTables(branch.id, { activeOnly: true })).find((t) => t.id === tableId) : undefined;
  const tableContext = order?.table
    ? { id: order.table.id, name: order.table.name }
    : seatedTable && seatedTable.orders.length === 0
      ? { id: seatedTable.id, name: seatedTable.name }
      : null;
  const guestCount = order?.guestCount ?? (typeof guests === "string" ? Math.max(1, Math.min(99, Number(guests) || 0)) || null : null);
  // A tab is just a name: the bill itself opens with the first round.
  const tabName = order?.tabName ?? (runsTabs && !tableContext && typeof tabParam === "string" ? tabParam.trim().slice(0, 60) || null : null);

  // Scale labels belong to industries that weigh things; elsewhere the parser stays switched off.
  const scale = {
    enabled: posTypeHasCapability(posType, "WEIGHT") && (branch.posConfig?.scaleBarcodeEnabled ?? false),
    prefix: branch.posConfig?.scaleBarcodePrefix ?? "2",
    codeDigits: branch.posConfig?.scaleCodeDigits ?? 5,
    mode: branch.posConfig?.scaleBarcodeMode ?? ("WEIGHT" as const),
  };

  if (branch.posConfig && !branch.posConfig.isActive) {
    return (
      <Alert>
        <AlertDescription>POS is switched off for {branch.name}. Another branch may still be selling.</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {registers.length === 0 ? (
        <Alert>
          <AlertDescription>
            No register is set up for {branch.name} yet. Sales still work, but they will not be tied to a drawer or shift.{" "}
            {auth.can("INVENTORY", "create") ? <Link href="/pos/registers">Add a register</Link> : "Ask your manager to add one."}
          </AlertDescription>
        </Alert>
      ) : null}
      <RegisterScreen
        /* A different order means a different cart, so the screen starts again rather than merging. */
        key={openJob?.id ?? openStay?.id ?? bookingOpen?.id ?? order?.id ?? tableContext?.id ?? tabName ?? "walk-in"}
        items={items}
        scale={scale}
        itemModifiers={itemModifiers}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        customers={customers}
        registers={registers}
        parked={parked}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        branchName={branch.name}
        posTypeLabel={posTypeLabel(posType)}
        vatEnabled={settings.vatEnabled}
        defaultVatRate={settings.defaultVatRate}
        canVoid={auth.can("POS", "delete")}
        currentUserName={auth.user.name}
        table={tableContext}
        tabName={tabName}
        callsNumbers={callsNumbers}
        scansCodes={scansCodes}
        hasPriceLists={hasPriceLists}
        /* Events keyed by the item that admits to them, so the line can ask which one. */
        events={Object.fromEntries(
          events
            .filter((event) => event.placesLeft > 0)
            .reduce((map, event) => {
              const list = map.get(event.variantId) ?? [];
              list.push({ id: event.id, name: event.name, placesLeft: event.placesLeft });
              map.set(event.variantId, list);
              return map;
            }, new Map<string, { id: string; name: string; placesLeft: number }[]>()),
        )}
        job={openJob ? { id: openJob.id, number: openJob.number, customerName: openJob.customerName, itemName: openJob.itemName } : null}
        stay={
          openStay
            ? {
                id: openStay.id,
                number: openStay.number,
                guestName: openStay.guestName,
                roomName: openStay.roomName,
                folioTotal: openStay.folioTotal,
              }
            : null
        }
        staff={staff.map((person) => ({ id: person.id, name: person.name }))}
        /* Keyed by customer, so choosing one at the till shows what they are entitled to. */
        memberships={Object.fromEntries(
          members.map((member) => [
            member.customerId,
            {
              planName: member.planName,
              endLabel: formatters.date(member.endDate),
              sessionsLeft: member.sessionsLeft,
              discountPercent: member.discountPercent,
            },
          ]),
        )}
        appointment={
          bookingOpen
            ? {
                id: bookingOpen.id,
                customerName: bookingOpen.customerName,
                staffName: bookingOpen.staffName,
                staffId: bookingOpen.staffId,
                lines: bookingOpen.items,
              }
            : null
        }
        order={
          order
            ? {
                id: order.id,
                number: order.number,
                note: order.note,
                customerId: order.customerId,
                tabName: order.tabName,
                lines: order.lines,
              }
            : null
        }
        guestCount={guestCount}
        payOnOpen={pay === "1" || Boolean(openStay)}
        hasKitchen={cooksToOrder}
      />
    </>
  );
}
