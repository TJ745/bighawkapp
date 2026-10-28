import "server-only";
import { db, type Tx } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { toDateOnly } from "@/lib/dates";
import type { PosPaymentMethod } from "@/lib/generated/prisma/enums";
import { applyStockMovement, round3 } from "./inventory";
import { getPriceContext, resolveListPrice, type PriceContext } from "./pricing";
import { consumeIngredients, getRecipes, recipeCost, returnIngredients, type RecipeLine } from "./recipes";
import { getStaffRates, recordLineStaff, reverseLineCommission, type StaffRate } from "./staff";
import { assertPlacesAvailable, getEventsForVariants, issueTickets, returnTickets } from "./tickets";
import {
  activateMembership,
  applyBenefit,
  consumeMembership,
  getMemberBenefit,
  getPlansForVariants,
  returnMembershipUse,
  type PlanForSale,
} from "./memberships";
import { nextOrderNumber } from "./pos-counter";
import { nextDocumentNumber } from "./numbering";
import { calcLine, calcTotals, round2 } from "./totals";

/**
 * The POS sale engine.
 *
 * One transaction does everything a completed sale implies: allocate the number, write the sale
 * and its lines, move stock through the inventory engine, and record the payments against the
 * company's payment accounts so Finance sees the money without a second code path.
 *
 * Line arithmetic comes from ./totals — the same functions the invoice form uses — so a POS
 * receipt and an invoice for identical lines always agree.
 */

export type CartLineInput = {
  variantId: string;
  quantity: number;
  /** Who performed this service, for commission. */
  staffId?: string | null;
  /** Tickets: the event this line admits to. */
  eventId?: string | null;
  /** The cashier asked for the member benefit on this line; the server decides what it is. */
  useMembership?: boolean;
  /**
   * A price the cashier typed, which overrides everything. Left out, the server prices the line:
   * catalogue, then the customer's price list, then its quantity breaks.
   */
  unitPrice?: number;
  discountPercent?: number;
  /** Chosen modifier options, by id. Their price deltas are applied server-side. */
  modifierOptionIds?: string[];
};

export type SalePaymentInput = {
  method: PosPaymentMethod;
  paymentAccountId: string;
  amount: number;
  reference?: string | null;
};

type ResolvedModifier = { optionId: string; groupName: string; optionName: string; priceDelta: number };

type ResolvedLine = {
  variantId: string | null;
  name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountPercent: number;
  vatRate: number;
  movesStock: boolean;
  modifiers: ResolvedModifier[];
  /** What selling one of these takes out of stock; empty for anything without a recipe. */
  recipe: RecipeLine[];
  /** Who performed it, where the branch pays commission. */
  staff: StaffRate | null;
  /** Sessions this line takes off a membership, and the membership it takes them from. */
  membership: { membershipId: string; sessions: number; reason: string } | null;
  /** Set when this line *is* a membership being bought. */
  plan: PlanForSale | null;
  /** Tickets: the event and how many places this line takes. */
  tickets: { eventId: string; places: number } | null;
  quantityIsPeriods: boolean;
};

export type SaleTotals = {
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
  costTotal: number;
};

/**
 * Turns cart lines into priced lines using the catalogue, the company VAT rate and the cart
 * discount. Prices, VAT and costs are resolved server-side: a client total is never trusted.
 */
export async function resolveCart(
  lines: CartLineInput[],
  options: {
    vatEnabled: boolean;
    defaultVatRate: number;
    cartDiscountPercent: number;
    /** Needed to resolve the staff a line names; commission is per branch. */
    branchId?: string;
    /** The customer's price list, resolved once for the cart. */
    priceContext?: PriceContext | null;
    /** Who is buying, for member entitlements, and the trading day for expiry. */
    customerId?: string | null;
    today?: string;
    /**
     * Keeps an option that has since been withdrawn. Set when re-pricing an order that was opened
     * earlier — a table should not become unsaveable because the menu changed mid-service.
     */
    allowWithdrawnModifiers?: boolean;
  },
): Promise<{ lines: ResolvedLine[]; totals: SaleTotals }> {
  if (lines.length === 0) throw new BusinessError("Add at least one item to the sale.");

  const variants = await db.itemVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          unit: true,
          salePrice: true,
          costPrice: true,
          vatRate: true,
          trackStock: true,
          isActive: true,
          kind: true,
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            // Withdrawn options are loaded too, so a chosen one can be told apart from a made-up id.
            include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
      },
    },
  });

  // A dish with a recipe consumes its ingredients instead of its own stock, and is costed from
  // them when nobody has costed the dish by hand.
  const recipes = await getRecipes(lines.map((l) => l.variantId));
  // Staff rates are read once for the whole cart, and only where a line names someone.
  const staffRates = options.branchId ? await getStaffRates(lines.map((l) => l.staffId), options.branchId) : new Map();
  // What this customer is entitled to, and which lines are plans being bought.
  const benefit =
    options.branchId && options.today && lines.some((line) => line.useMembership)
      ? await getMemberBenefit(options.customerId ?? null, options.branchId, options.today)
      : null;
  const plans = await getPlansForVariants(lines.map((l) => l.variantId));
  // Events are read once for the cart, and places are counted down across it so two lines cannot
  // sell the same seat.
  const events = options.branchId && lines.some((line) => line.eventId) ? await getEventsForVariants(lines.map((l) => l.variantId), options.branchId) : [];
  const placesTaken = new Map<string, number>();
  // Sessions are counted down across the cart, so two covered lines cannot spend the same session.
  let sessionsLeft = benefit?.sessionsLeft ?? null;

  const cartDiscount = Math.min(100, Math.max(0, num(options.cartDiscountPercent)));
  const resolved: ResolvedLine[] = lines.map((line) => {
    const variant = variants.find((v) => v.id === line.variantId);
    if (!variant) throw new BusinessError("One of the items is no longer available.");
    if (!variant.isActive || !variant.item.isActive) throw new BusinessError(`${variant.item.name} is no longer available to sell.`);

    const quantity = round3(num(line.quantity));
    if (quantity <= 0) throw new BusinessError(`Enter a quantity for ${variant.item.name}.`);

    const catalogPrice = variant.salePrice === null ? num(variant.item.salePrice) : num(variant.salePrice);
    /**
     * What the customer pays before modifiers: the price the cashier typed if they typed one,
     * otherwise what this customer's price list says for this quantity.
     */
    const listed = resolveListPrice(options.priceContext ?? null, variant.id, quantity, catalogPrice);
    const basePrice = round2(line.unitPrice === undefined ? listed.price : num(line.unitPrice));
    if (basePrice < 0) throw new BusinessError("A price cannot be negative.");

    /**
     * Modifiers: only options belonging to a group this item actually asks about are accepted, and
     * each group's own min/max is enforced here. The price delta is read from the option, never
     * from the client, so "extra shot" cannot be made free by editing the request.
     */
    const chosenIds = line.modifierOptionIds ?? [];
    const modifiers: ResolvedModifier[] = [];
    let modifierDelta = 0;
    for (const link of variant.item.modifierGroups) {
      const group = link.group;
      const picked = group.options.filter((option) => chosenIds.includes(option.id));
      // A withdrawn group stops being asked about: the till no longer offers it, so it must not
      // make the item unsellable either. What was already chosen from it is kept on re-pricing.
      if (!group.isActive) {
        if (picked.length === 0) continue;
        if (!options.allowWithdrawnModifiers) throw new BusinessError(`${group.name} is no longer offered.`);
      }
      if (picked.length < group.minSelect) {
        throw new BusinessError(`Choose ${group.minSelect === 1 ? "an option" : `at least ${group.minSelect} options`} for ${group.name}.`);
      }
      if (group.maxSelect > 0 && picked.length > group.maxSelect) {
        throw new BusinessError(`${group.name} allows at most ${group.maxSelect}.`);
      }
      for (const option of picked) {
        if (!option.isActive && !options.allowWithdrawnModifiers) {
          throw new BusinessError(`${option.name} is no longer offered.`);
        }
        modifiers.push({ optionId: option.id, groupName: group.name, optionName: option.name, priceDelta: num(option.priceDelta) });
        modifierDelta += num(option.priceDelta);
      }
    }
    const unknown = chosenIds.filter((id) => !modifiers.some((m) => m.optionId === id));
    if (unknown.length > 0) throw new BusinessError(`${variant.item.name} does not offer one of the chosen options.`);

    const recipe = recipes.get(variant.id) ?? [];
    const ownCost = variant.costPrice === null ? num(variant.item.costPrice) : num(variant.costPrice);
    const unitCost = ownCost > 0 || recipe.length === 0 ? ownCost : recipeCost(recipe);
    const itemVat = variant.item.vatRate === null ? options.defaultVatRate : num(variant.item.vatRate);
    // Per-line discount and the cart-wide discount combine on the line, so VAT is charged on
    // what the customer actually pays.
    /**
     * The member benefit is resolved here, on the server: the cashier only asks for it. A plan
     * being bought is spotted here too, so the entitlement it grants is written with the sale.
     */
    let membership: ResolvedLine["membership"] = null;
    let memberDiscount = 0;
    if (line.useMembership) {
      if (!benefit) {
        throw new BusinessError(
          options.customerId ? "That customer has no membership running." : "Choose the customer before using a membership.",
        );
      }
      const priced = applyBenefit(
        { ...benefit, sessionsLeft },
        { variantId: variant.id, quantity, isService: variant.item.kind === "SERVICE", name: variant.item.name },
      );
      memberDiscount = priced.discountPercent;
      if (priced.sessions > 0) {
        sessionsLeft = sessionsLeft === null ? null : sessionsLeft - priced.sessions;
        membership = { membershipId: benefit.membershipId, sessions: priced.sessions, reason: priced.reason };
      } else {
        membership = { membershipId: benefit.membershipId, sessions: 0, reason: priced.reason };
      }
    }

    /**
     * Tickets: the event decides whether these places exist, not the till. Asking for a place at
     * a sold-out event is refused rather than quietly sold.
     */
    let tickets: ResolvedLine["tickets"] = null;
    if (line.eventId) {
      const event = events.find((row) => row.eventId === line.eventId);
      if (!event) throw new BusinessError("That event is not on sale at this branch.");
      assertPlacesAvailable(event, variant.id, quantity, placesTaken.get(event.eventId) ?? 0);
      placesTaken.set(event.eventId, (placesTaken.get(event.eventId) ?? 0) + quantity);
      tickets = { eventId: event.eventId, places: quantity };
    }

    const lineDiscount = Math.max(memberDiscount, Math.min(100, Math.max(0, num(line.discountPercent ?? 0))));
    const combined = round2(100 - ((100 - lineDiscount) * (100 - cartDiscount)) / 100);

    return {
      variantId: variant.id,
      name: variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name,
      sku: variant.sku,
      unit: variant.item.unit,
      quantity,
      // Modifier deltas ride on the unit price, so discounts and VAT apply to what is charged.
      unitPrice: round2(Math.max(0, basePrice + modifierDelta)),
      unitCost,
      discountPercent: combined,
      vatRate: options.vatEnabled ? itemVat : 0,
      // One rule, in one place: a recipe replaces the dish's own stock movement.
      movesStock: recipe.length === 0 && variant.item.trackStock && variant.item.kind === "PRODUCT",
      modifiers,
      recipe,
      staff: line.staffId ? (staffRates.get(line.staffId) ?? null) : null,
      membership,
      plan: plans.get(variant.id) ?? null,
      tickets,
      quantityIsPeriods: plans.has(variant.id),
    };
  });

  const totals = calcTotals(resolved);
  const costTotal = round2(resolved.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
  return { lines: resolved, totals: { ...totals, costTotal } };
}

/** The open shift at a register, or null. A sale may be rung up without one. */
export async function getOpenShift(registerId: string) {
  return db.posShift.findFirst({ where: { registerId, status: "OPEN" }, orderBy: { openedAt: "desc" } });
}

/**
 * Checks the money offered against a total and works out the change.
 *
 * Shared by a sale rung up in one go and an order paid off later, so "payments must cover the
 * total" and "change is only ever given against cash" mean the same thing in both.
 */
export async function settlePayments(payments: SalePaymentInput[], grandTotal: number) {
  if (payments.length === 0) throw new BusinessError("Take a payment or hold the sale instead.");
  const paid = round2(payments.reduce((sum, p) => sum + num(p.amount), 0));
  if (paid < grandTotal) throw new BusinessError(`Payments are ${round2(grandTotal - paid)} short of the total.`);

  const accounts = await db.paymentAccount.findMany({
    where: { id: { in: payments.map((p) => p.paymentAccountId) }, isActive: true },
    select: { id: true },
  });
  for (const payment of payments) {
    if (num(payment.amount) <= 0) throw new BusinessError("Each payment must be more than 0.");
    if (!accounts.some((a) => a.id === payment.paymentAccountId)) throw new BusinessError("Choose an active payment account for every payment.");
  }

  // Change is only meaningful for cash; card overpayment is not a thing.
  const cashPaid = round2(payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + num(p.amount), 0));
  const overpaid = round2(Math.max(0, paid - grandTotal));
  const changeDue = Math.min(overpaid, cashPaid);
  if (overpaid > changeDue) throw new BusinessError("Card and transfer payments cannot exceed the total.");

  return { paid, changeDue };
}

/** Writes the payment rows net of change, so each account receives what was actually kept. */
async function recordPayments(
  tx: Tx,
  input: { saleId: string; payments: SalePaymentInput[]; changeDue: number; date: string },
) {
  let remainingChange = input.changeDue;
  for (const payment of input.payments) {
    let amount = round2(num(payment.amount));
    if (payment.method === "CASH" && remainingChange > 0) {
      const applied = Math.min(remainingChange, amount);
      amount = round2(amount - applied);
      remainingChange = round2(remainingChange - applied);
    }
    if (amount <= 0) continue;
    await tx.posPayment.create({
      data: {
        saleId: input.saleId,
        method: payment.method,
        paymentAccountId: payment.paymentAccountId,
        amount,
        reference: payment.reference ?? null,
        date: new Date(`${input.date}T00:00:00.000Z`),
      },
    });
  }
}

export type CreateSaleInput = {
  branchId: string;
  registerId: string | null;
  shiftId: string | null;
  customerId: string | null;
  /** Dine-in: the table the order runs on, and how many are seated. */
  tableId?: string | null;
  guestCount?: number | null;
  /** Bar: the name the tab runs under, when there is no table. */
  tabName?: string | null;
  /** The booking this sale pays for. Linked inside the same transaction as the money. */
  appointmentId?: string | null;
  /** The repair job this sale pays for, linked the same way. */
  workOrderId?: string | null;
  /** Quick service: take a collection number for the day, to call out at the counter. */
  withOrderNumber?: boolean;
  /**
   * The till's own id for this sale, when it was rung up offline and is being replayed.
   *
   * Replay has to be safe to repeat: a connection that drops *after* the server committed but
   * before the till heard back leaves the queue thinking it failed. Without this the retry would
   * ring the sale up twice — money invented, stock gone, and nobody the wiser.
   */
  clientReference?: string | null;
  cartDiscountPercent: number;
  note: string | null;
  lines: CartLineInput[];
  payments: SalePaymentInput[];
  /** PARKED holds the cart without taking money or moving stock. */
  park: boolean;
  cashier: { id: string; name: string };
  today: string;
  vatEnabled: boolean;
  defaultVatRate: number;
};

/**
 * The sale lines as they are stored: each one snapshots name, SKU, price, unit cost and the
 * chosen options, so a receipt still reads correctly after the catalogue changes.
 */
function saleItemRows(lines: ResolvedLine[], options: { movedStock: boolean }) {
  return lines.map((line, index) => {
    const lineTotals = calcLine(line);
    return {
      variantId: line.variantId,
      name: line.name,
      sku: line.sku,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      discountPercent: line.discountPercent,
      vatRate: line.vatRate,
      lineSubtotal: lineTotals.subtotal,
      lineDiscount: lineTotals.discount,
      lineVat: lineTotals.vat,
      lineTotal: lineTotals.total,
      movedStock: options.movedStock && line.movesStock,
      sortOrder: index,
      modifiers: {
        create: line.modifiers.map((modifier, position) => ({
          optionId: modifier.optionId,
          groupName: modifier.groupName,
          optionName: modifier.optionName,
          priceDelta: modifier.priceDelta,
          sortOrder: position,
        })),
      },
    };
  });
}

/** Records a sale. Everything below either all succeeds or none of it does. */
export async function createSale(input: CreateSaleInput) {
  const priceContext = await getPriceContext(input.customerId);
  const { lines, totals } = await resolveCart(input.lines, {
    vatEnabled: input.vatEnabled,
    defaultVatRate: input.defaultVatRate,
    cartDiscountPercent: input.cartDiscountPercent,
    branchId: input.branchId,
    customerId: input.customerId,
    today: input.today,
    priceContext,
  });

  const settled = input.park ? { paid: 0, changeDue: 0 } : await settlePayments(input.payments, totals.grandTotal);
  const { paid, changeDue } = settled;

  const date = input.today;

  /**
   * Already recorded? Then this is a repeat of a replay that did reach the server, and the answer
   * is the sale it already made. Checked before the transaction so a repeat costs one query, and
   * backed by a unique index so two replays racing cannot both get through.
   */
  if (input.clientReference) {
    const existing = await db.posSale.findUnique({
      where: { clientReference: input.clientReference },
      select: { id: true, number: true, orderNumber: true, status: true, changeDue: true },
    });
    if (existing) {
      return {
        id: existing.id,
        number: existing.number,
        orderNumber: existing.orderNumber,
        totals,
        changeDue: num(existing.changeDue),
        status: existing.status,
        alreadyRecorded: true as const,
      };
    }
  }

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "POS_SALE", new Date());
    // A collection number is only taken when the counter actually calls numbers out.
    const orderNumber = input.withOrderNumber ? await nextOrderNumber(tx, input.branchId, date) : null;

    const sale = await tx.posSale.create({
      data: {
        number,
        clientReference: input.clientReference ?? null,
        branchId: input.branchId,
        registerId: input.registerId,
        shiftId: input.park ? null : input.shiftId,
        customerId: input.customerId,
        tableId: input.tableId ?? null,
        guestCount: input.guestCount ?? null,
        tabName: input.tabName ?? null,
        orderNumber,
        status: input.park ? "PARKED" : "COMPLETED",
        date: new Date(`${date}T00:00:00.000Z`),
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatTotal: totals.vatTotal,
        grandTotal: totals.grandTotal,
        costTotal: totals.costTotal,
        paidTotal: input.park ? 0 : round2(paid - changeDue),
        changeDue: input.park ? 0 : changeDue,
        cartDiscountPercent: Math.min(100, Math.max(0, num(input.cartDiscountPercent))),
        note: input.note,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        items: { create: saleItemRows(lines, { movedStock: !input.park }) },
      },
      include: { items: true },
    });

    if (!input.park) {
      // Stock leaves through the inventory engine, which refuses to go negative and writes the
      // movement that explains the new level.
      for (const [index, line] of lines.entries()) {
        const saleLine = sale.items.find((item) => item.sortOrder === index);
        if (saleLine && line.tickets) {
          await issueTickets(tx, { eventId: line.tickets.eventId, saleItemId: saleLine.id, places: line.tickets.places });
        }
        if (saleLine && line.membership && line.membership.sessions > 0) {
          await consumeMembership(tx, {
            membershipId: line.membership.membershipId,
            saleItemId: saleLine.id,
            name: line.name,
            sessions: line.membership.sessions,
          });
        }
        if (line.plan) {
          // Buying a plan needs somebody to credit it to.
          if (!input.customerId) throw new BusinessError(`Choose the customer before selling ${line.plan.name}.`);
          await activateMembership(tx, {
            plan: line.plan,
            customerId: input.customerId,
            branchId: input.branchId,
            saleId: sale.id,
            today: date,
            price: round2(line.quantity * line.unitPrice),
            quantity: line.quantity,
          });
        }
        if (saleLine && line.staff) {
          const lineTotals = calcLine(line);
          await recordLineStaff(tx, { saleItemId: saleLine.id, staff: line.staff, lineNet: round2(lineTotals.subtotal - lineTotals.discount) });
        }
        if (line.recipe.length > 0) {
          // A dish takes its ingredients out instead of itself, and records what it took.
          const saleItem = sale.items.find((item) => item.sortOrder === index);
          if (saleItem) {
            await consumeIngredients(tx, {
              saleItemId: saleItem.id,
              lines: line.recipe,
              soldQuantity: line.quantity,
              branchId: input.branchId,
              reference: number,
              referenceId: sale.id,
              user: input.cashier,
            });
          }
          continue;
        }
        if (!line.movesStock || !line.variantId) continue;
        await applyStockMovement(tx, {
          variantId: line.variantId,
          branchId: input.branchId,
          kind: "SALE",
          quantity: -line.quantity,
          unitCost: line.unitCost,
          referenceType: "POS_SALE",
          referenceId: sale.id,
          reference: number,
          userId: input.cashier.id,
          userName: input.cashier.name,
        });
      }

      await recordPayments(tx, { saleId: sale.id, payments: input.payments, changeDue, date });
    }

    if (input.appointmentId) {
      /**
       * Compare-and-set: the booking is only linked if it is still unpaid and still happened. A
       * second till paying the same booking finds nothing to update, and the whole sale — money,
       * stock and commission — rolls back with this error.
       */
      const linked = await tx.appointment.updateMany({
        where: { id: input.appointmentId, branchId: input.branchId, saleId: null, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
        data: { saleId: sale.id, status: "COMPLETED" },
      });
      if (linked.count === 0) throw new BusinessError("That booking has already been paid for, or did not happen.");
    }

    if (input.workOrderId) {
      // The same compare-and-set as a booking: a job paid for twice rolls the second sale back.
      const linked = await tx.workOrder.updateMany({
        where: { id: input.workOrderId, branchId: input.branchId, saleId: null, status: { notIn: ["CANCELLED"] } },
        data: { saleId: sale.id },
      });
      if (linked.count === 0) throw new BusinessError("That job has already been paid for, or was cancelled.");
    }

    return { id: sale.id, number, orderNumber, totals, changeDue, status: sale.status, alreadyRecorded: false as const };
  });
}

/** Returns a parked sale's cart so the till can pick it up again. */
export async function resumeParkedSale(saleId: string) {
  const sale = await db.posSale.findUnique({ where: { id: saleId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!sale) throw new BusinessError("That held sale no longer exists.");
  if (sale.status !== "PARKED") throw new BusinessError("That sale is no longer on hold.");
  return sale;
}

/**
 * Replaces what is on a held order, keeping its number.
 *
 * A dine-in order grows over the evening, so the rounds are added to the same document instead of
 * holding a new one each time. Prices are resolved from the catalogue again, exactly as they are
 * for a fresh cart, so nothing the client sends is trusted.
 */
export async function updateParkedSale(input: {
  saleId: string;
  branchId: string;
  lines: CartLineInput[];
  cartDiscountPercent: number;
  customerId: string | null;
  note: string | null;
  guestCount?: number | null;
  /** Renames the tab; left out, the name it is running under is kept. */
  tabName?: string | null;
  vatEnabled: boolean;
  defaultVatRate: number;
}) {
  const sale = await db.posSale.findUnique({ where: { id: input.saleId }, select: { id: true, number: true, status: true, branchId: true } });
  if (!sale) throw new BusinessError("That order no longer exists.");
  if (sale.status !== "PARKED") throw new BusinessError("That order has already been paid or voided.");
  if (sale.branchId !== input.branchId) throw new BusinessError("That order belongs to another branch.");

  const { lines, totals } = await resolveCart(input.lines, {
    vatEnabled: input.vatEnabled,
    defaultVatRate: input.defaultVatRate,
    cartDiscountPercent: input.cartDiscountPercent,
    allowWithdrawnModifiers: true,
    branchId: input.branchId,
    customerId: input.customerId,
    priceContext: await getPriceContext(input.customerId),
  });

  return db.$transaction(async (tx) => {
    // The lines are rewritten wholesale; no stock moved for them, so nothing is left behind.
    await tx.posSaleItem.deleteMany({ where: { saleId: sale.id } });
    const updated = await tx.posSale.update({
      where: { id: sale.id },
      data: {
        customerId: input.customerId,
        note: input.note,
        ...(input.guestCount === undefined ? {} : { guestCount: input.guestCount }),
        ...(input.tabName === undefined || input.tabName === null ? {} : { tabName: input.tabName }),
        cartDiscountPercent: Math.min(100, Math.max(0, num(input.cartDiscountPercent))),
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        vatTotal: totals.vatTotal,
        grandTotal: totals.grandTotal,
        costTotal: totals.costTotal,
        items: { create: saleItemRows(lines, { movedStock: false }) },
      },
      include: { items: true },
    });

    // Who performed each service travels with the rewritten lines; the report only counts the
    // commission once the bill is actually paid.
    for (const [index, line] of lines.entries()) {
      if (!line.staff) continue;
      const saleLine = updated.items.find((item) => item.sortOrder === index);
      if (!saleLine) continue;
      const lineTotals = calcLine(line);
      await recordLineStaff(tx, { saleItemId: saleLine.id, staff: line.staff, lineNet: round2(lineTotals.subtotal - lineTotals.discount) });
    }

    return { id: sale.id, number: sale.number, totals };
  });
}

/**
 * Settles a held order: takes the money, moves the stock and closes it, keeping the number the
 * table has been running under. The cash-basis date becomes the day it was paid, because that is
 * when Finance sees the money.
 */
export async function completeParkedSale(input: {
  saleId: string;
  branchId: string;
  registerId: string | null;
  shiftId: string | null;
  payments: SalePaymentInput[];
  cashier: { id: string; name: string };
  today: string;
  withOrderNumber?: boolean;
}) {
  const sale = await db.posSale.findUnique({
    where: { id: input.saleId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!sale) throw new BusinessError("That order no longer exists.");
  if (sale.status !== "PARKED") throw new BusinessError("That order has already been paid or voided.");
  if (sale.branchId !== input.branchId) throw new BusinessError("That order belongs to another branch.");
  if (sale.items.length === 0) throw new BusinessError("Add something to the order before taking payment.");

  const grandTotal = num(sale.grandTotal);
  const { paid, changeDue } = await settlePayments(input.payments, grandTotal);

  // Whether a line moves stock is a property of the item, not of the snapshot, so it is read back.
  const variants = await db.itemVariant.findMany({
    where: { id: { in: sale.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, item: { select: { trackStock: true, kind: true } } },
  });
  const movesStock = (variantId: string | null) => {
    const variant = variants.find((v) => v.id === variantId);
    return Boolean(variant && variant.item.trackStock && variant.item.kind === "PRODUCT");
  };

  // Ingredients are read now, when the order is settled: nothing left the store while it was held.
  const recipes = await getRecipes(sale.items.map((item) => item.variantId ?? ""));

  const date = input.today;
  return db.$transaction(async (tx) => {
    for (const item of sale.items) {
      const recipe = item.variantId ? (recipes.get(item.variantId) ?? []) : [];
      if (recipe.length > 0) {
        await consumeIngredients(tx, {
          saleItemId: item.id,
          lines: recipe,
          soldQuantity: num(item.quantity),
          branchId: sale.branchId,
          reference: sale.number,
          referenceId: sale.id,
          user: input.cashier,
        });
        continue;
      }
      if (!item.variantId || !movesStock(item.variantId)) continue;
      await applyStockMovement(tx, {
        variantId: item.variantId,
        branchId: sale.branchId,
        kind: "SALE",
        quantity: -num(item.quantity),
        unitCost: num(item.unitCost),
        referenceType: "POS_SALE",
        referenceId: sale.id,
        reference: sale.number,
        userId: input.cashier.id,
        userName: input.cashier.name,
      });
      await tx.posSaleItem.update({ where: { id: item.id }, data: { movedStock: true } });
    }

    await recordPayments(tx, { saleId: sale.id, payments: input.payments, changeDue, date });

    // A tab settled at a counter that calls numbers out takes one now, not when it was opened.
    const orderNumber = input.withOrderNumber && sale.orderNumber === null ? await nextOrderNumber(tx, sale.branchId, date) : sale.orderNumber;

    await tx.posSale.update({
      where: { id: sale.id },
      data: {
        status: "COMPLETED",
        orderNumber,
        registerId: input.registerId ?? sale.registerId,
        shiftId: input.shiftId,
        soldAt: new Date(),
        date: new Date(`${date}T00:00:00.000Z`),
        paidTotal: round2(paid - changeDue),
        changeDue,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
      },
    });

    return {
      id: sale.id,
      number: sale.number,
      orderNumber,
      changeDue,
      totals: {
        subtotal: num(sale.subtotal),
        discountTotal: num(sale.discountTotal),
        vatTotal: num(sale.vatTotal),
        grandTotal,
        costTotal: num(sale.costTotal),
      },
    };
  });
}

/**
 * Voids a sale: puts the stock back and reverses the money. Used for mistakes at the till, which
 * is why it is permission-gated rather than available to every cashier.
 */
export async function voidSale(input: { saleId: string; reason: string; user: { id: string; name: string } }) {
  const sale = await db.posSale.findUnique({ where: { id: input.saleId }, include: { items: true, payments: true } });
  if (!sale) throw new BusinessError("Sale not found.");
  if (sale.status === "VOIDED") throw new BusinessError("This sale is already voided.");
  if (sale.status === "REFUNDED" || sale.status === "PARTIALLY_REFUNDED") {
    throw new BusinessError("This sale has been refunded; it cannot also be voided.");
  }

  return db.$transaction(async (tx) => {
    for (const item of sale.items) {
      // Commission on a voided line was never really earned, and a session it spent comes back.
      await reverseLineCommission(tx, { saleItemId: item.id, portion: 1 });
      await returnMembershipUse(tx, item.id);
      await returnTickets(tx, item.id, 1);
      // Whatever the line consumed goes back from its own snapshot, not from today's recipe.
      await returnIngredients(tx, {
        saleItemId: item.id,
        portion: 1,
        branchId: sale.branchId,
        reference: sale.number,
        referenceId: sale.id,
        referenceType: "POS_VOID",
        note: input.reason,
        user: input.user,
      });
      if (!item.movedStock || !item.variantId) continue;
      await applyStockMovement(tx, {
        variantId: item.variantId,
        branchId: sale.branchId,
        kind: "SALE_RETURN",
        quantity: num(item.quantity),
        unitCost: num(item.unitCost),
        referenceType: "POS_VOID",
        referenceId: sale.id,
        reference: sale.number,
        note: input.reason,
        userId: input.user.id,
        userName: input.user.name,
      });
    }
    // Removing the payment rows takes the money back out of Finance, which reads them directly.
    await tx.posPayment.deleteMany({ where: { saleId: sale.id } });
    await tx.posSale.update({
      where: { id: sale.id },
      data: {
        status: "VOIDED",
        paidTotal: 0,
        changeDue: 0,
        voidedAt: new Date(),
        voidedByName: input.user.name,
        voidReason: input.reason,
      },
    });
    return { number: sale.number };
  });
}

/** Deletes a held sale that was never completed — no money or stock was involved. */
export async function discardParkedSale(saleId: string) {
  const sale = await db.posSale.findUnique({ where: { id: saleId }, select: { id: true, status: true, number: true } });
  if (!sale) throw new BusinessError("Sale not found.");
  if (sale.status !== "PARKED") throw new BusinessError("Only a held sale can be discarded.");
  await db.posSale.delete({ where: { id: saleId } });
  return { number: sale.number };
}

// --- Shifts ------------------------------------------------------------------

export type ShiftSummary = {
  cashSales: number;
  cardSales: number;
  otherSales: number;
  totalSales: number;
  /** Refunds given during this shift, as a positive number. */
  refunds: number;
  cashRefunds: number;
  netSales: number;
  saleCount: number;
  returnCount: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
};

/**
 * What the drawer should hold: the float, plus cash taken, plus cash added, less cash removed.
 * Card and transfer takings never touch the drawer.
 */
export async function getShiftSummary(shiftId: string): Promise<ShiftSummary> {
  const shift = await db.posShift.findUnique({ where: { id: shiftId }, select: { openingCash: true } });
  if (!shift) throw new BusinessError("Shift not found.");

  // Takings belong to the shift that rang the sale; a refund belongs to the shift that gave the
  // money back, which may be a later one — so the two are counted separately.
  const [takings, refunds, movements, saleCount, returnCount] = await Promise.all([
    db.posPayment.groupBy({
      by: ["method"],
      where: { returnId: null, sale: { shiftId, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } } },
      _sum: { amount: true },
    }),
    db.posPayment.groupBy({ by: ["method"], where: { posReturn: { shiftId } }, _sum: { amount: true } }),
    db.posCashMovement.groupBy({ by: ["kind"], where: { shiftId }, _sum: { amount: true } }),
    db.posSale.count({ where: { shiftId, status: { not: "VOIDED" } } }),
    db.posReturn.count({ where: { shiftId } }),
  ]);

  const by = (rows: typeof takings, method: string) => num(rows.find((p) => p.method === method)?._sum.amount);
  const cashSales = by(takings, "CASH");
  const cardSales = by(takings, "CARD");
  const otherSales = round2(by(takings, "TRANSFER") + by(takings, "OTHER"));
  // Refund rows are stored negative; report them as positive amounts given back.
  const cashRefunds = round2(-by(refunds, "CASH"));
  const refundTotal = round2(-refunds.reduce((total, row) => total + num(row._sum.amount), 0));
  const cashIn = num(movements.find((m) => m.kind === "CASH_IN")?._sum.amount);
  const cashOut = num(movements.find((m) => m.kind === "CASH_OUT")?._sum.amount);
  const totalSales = round2(cashSales + cardSales + otherSales);

  return {
    cashSales,
    cardSales,
    otherSales,
    totalSales,
    refunds: refundTotal,
    cashRefunds,
    netSales: round2(totalSales - refundTotal),
    saleCount,
    returnCount,
    cashIn,
    cashOut,
    expectedCash: round2(num(shift.openingCash) + cashSales - cashRefunds + cashIn - cashOut),
  };
}

export async function openShift(input: { registerId: string; branchId: string; openingCash: number; user: { id: string; name: string } }) {
  const existing = await getOpenShift(input.registerId);
  if (existing) throw new BusinessError("This register already has an open shift.");
  if (num(input.openingCash) < 0) throw new BusinessError("Opening cash cannot be negative.");

  return db.posShift.create({
    data: {
      registerId: input.registerId,
      branchId: input.branchId,
      openingCash: round2(num(input.openingCash)),
      openedById: input.user.id,
      openedByName: input.user.name,
    },
  });
}

export async function closeShift(input: { shiftId: string; countedCash: number; note: string | null; user: { id: string; name: string } }) {
  const shift = await db.posShift.findUnique({ where: { id: input.shiftId }, select: { id: true, status: true } });
  if (!shift) throw new BusinessError("Shift not found.");
  if (shift.status === "CLOSED") throw new BusinessError("This shift is already closed.");
  if (num(input.countedCash) < 0) throw new BusinessError("Counted cash cannot be negative.");

  const summary = await getShiftSummary(input.shiftId);
  const counted = round2(num(input.countedCash));
  const variance = round2(counted - summary.expectedCash);

  await db.posShift.update({
    where: { id: input.shiftId },
    data: {
      status: "CLOSED",
      closingCash: counted,
      expectedCash: summary.expectedCash,
      variance,
      closedById: input.user.id,
      closedByName: input.user.name,
      closedAt: new Date(),
      note: input.note,
    },
  });
  return { ...summary, countedCash: counted, variance };
}

export async function recordCashMovement(input: {
  shiftId: string;
  kind: "CASH_IN" | "CASH_OUT";
  amount: number;
  reason: string;
  user: { id: string; name: string };
}) {
  const shift = await db.posShift.findUnique({ where: { id: input.shiftId }, select: { status: true } });
  if (!shift) throw new BusinessError("Shift not found.");
  if (shift.status !== "OPEN") throw new BusinessError("The shift is closed.");
  if (num(input.amount) <= 0) throw new BusinessError("Enter an amount.");

  if (input.kind === "CASH_OUT") {
    const summary = await getShiftSummary(input.shiftId);
    if (num(input.amount) > summary.expectedCash) {
      throw new BusinessError(`Only ${summary.expectedCash} is in the drawer.`);
    }
  }

  return db.posCashMovement.create({
    data: {
      shiftId: input.shiftId,
      kind: input.kind,
      amount: round2(num(input.amount)),
      reason: input.reason,
      userId: input.user.id,
      userName: input.user.name,
    },
  });
}

/** Today's date in the company time zone, as the rest of the app computes it. */
export function saleDateFromToday(today: string) {
  return toDateOnly(new Date(`${today}T00:00:00.000Z`));
}
