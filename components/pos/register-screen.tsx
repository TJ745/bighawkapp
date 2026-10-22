"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  Barcode,
  Loader2,
  Minus,
  Package,
  PauseCircle,
  Percent,
  PlayCircle,
  Plus,
  CreditCard,
  Search,
  ShoppingCart,
  Trash2,
  Utensils,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/shared/combobox";
import { useFormat } from "@/components/providers/format-provider";
import { completeSale, discardSale, resumeSale } from "@/actions/pos";
import { sendOrderToKitchen } from "@/actions/kitchen";
import { payAppointment } from "@/actions/staff";
import { checkOutStay, payWorkOrder } from "@/actions/industries";
import { quotePrices } from "@/actions/pricing";
import { payOrder, saveOrder } from "@/actions/tables";
import { calcTotals } from "@/lib/business/totals";
import type { ParkedSale, RegisterItem, RegisterRow } from "@/lib/data/pos";
import { isMeasuredUnit, parseScaleBarcode, scaleQuantity, type ScaleBarcodeConfig } from "@/lib/business/scale-barcode";
import { cn } from "@/lib/utils";
import type { ItemModifierMap } from "@/lib/data/modifiers";
import { ModifierDialog, type ModifierChoice } from "./modifier-dialog";
import { PaymentDialog, type PaymentDraft } from "./payment-dialog";
import { ReceiptDialog, type ReceiptData } from "./receipt-dialog";
import { ShiftBar } from "./shift-bar";

export type CartLine = {
  key: string;
  variantId: string;
  name: string;
  unit: string;
  /** Includes the modifier price deltas, which is what the customer pays per unit. */
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  vatRate: number;
  stock: number | null;
  trackStock: boolean;
  modifiers: ModifierChoice[];
  /** Service lines only: who performed it, for commission. */
  staffId: string | null;
  kind: string;
  /** The cashier asked for the membership on this line. */
  useMembership: boolean;
  /** The cashier typed this price, so it travels to the server. Otherwise the server prices it. */
  priceEdited: boolean;
  /** Where the price on screen came from, for the hint under the line. */
  priceSource: "catalogue" | "list" | "tier";
  /** Tickets: the event this line admits to, chosen on the line. */
  eventId: string | null;
};

type Props = {
  items: RegisterItem[];
  /** How this branch's scales encode a label; disabled for industries that do not weigh. */
  scale: ScaleBarcodeConfig;
  /** Modifier groups per item id; empty for industries that do not ask questions. */
  itemModifiers: ItemModifierMap;
  categories: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  registers: RegisterRow[];
  parked: ParkedSale[];
  accounts: { id: string; name: string; type: string }[];
  branchName: string;
  posTypeLabel: string;
  vatEnabled: boolean;
  defaultVatRate: number;
  canVoid: boolean;
  currentUserName: string;
  /** Dine-in: the table this cart belongs to, null for a walk-in sale at the counter. */
  table?: { id: string; name: string } | null;
  /** The open order being added to, when the floor plan sent us to one. */
  order?: OrderContext | null;
  guestCount?: number | null;
  /** The floor plan's "Pay" button opens the payment dialog straight away. */
  payOnOpen?: boolean;
  /** This branch cooks to order: saving a round also sends it to the kitchen. */
  hasKitchen?: boolean;
  /** Bar tabs: the name this bill runs under, when it is not on a table. */
  tabName?: string | null;
  /** Quick service: the counter calls out a collection number, so the receipt shows one. */
  callsNumbers?: boolean;
  /**
   * Whether this industry sells by scanning. It decides how the till opens — scan box focused and
   * ready, or the catalogue waiting to be tapped — not what the search can find.
   */
  scansCodes?: boolean;
  /** The team, where services earn commission; empty elsewhere. */
  staff?: { id: string; name: string }[];
  /** Live memberships by customer id, so choosing a customer shows what they are owed. */
  memberships?: Record<string, { planName: string; endLabel: string; sessionsLeft: number | null; discountPercent: number }>;
  /** This branch prices by customer, so the cart is re-priced when the customer changes. */
  hasPriceLists?: boolean;
  /** Events on sale, by the item that admits to them; empty where the industry has none. */
  events?: Record<string, { id: string; name: string; placesLeft: number }[]>;
  /** A repair job being paid for: the till settles it and the job is marked paid. */
  job?: { id: string; number: string; customerName: string; itemName: string } | null;
  /** A room's folio being settled: paying it checks the guest out. */
  stay?: { id: string; number: string; guestName: string; roomName: string; folioTotal: number } | null;
  /** A booking being paid for: its services are already in the cart. */
  appointment?: {
    id: string;
    customerName: string;
    staffName: string;
    staffId: string;
    /** The services booked, which the cart starts from. */
    lines: { variantId: string | null; name: string; price: number; staffId: string }[];
  } | null;
};

/** An open table order as the till picks it up: the stored lines, options and all. */
export type OrderContext = {
  id: string;
  number: string;
  note: string | null;
  customerId: string | null;
  /** Set when the bill is a bar tab rather than a table. */
  tabName?: string | null;
  lines: {
    id: string;
    variantId: string | null;
    name: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    vatRate: number;
    modifiers: ModifierChoice[];
    /** Set when the line came from a booking: who is doing it. */
    staffId?: string | null;
  }[];
};

export function RegisterScreen({
  items,
  scale,
  itemModifiers,
  categories,
  customers,
  registers,
  parked,
  accounts,
  branchName,
  posTypeLabel,
  vatEnabled,
  defaultVatRate,
  currentUserName,
  table = null,
  order = null,
  guestCount = null,
  payOnOpen = false,
  hasKitchen = false,
  tabName = null,
  callsNumbers = false,
  scansCodes = false,
  staff = [],
  memberships = {},
  hasPriceLists = false,
  events = {},
  job = null,
  stay = null,
  appointment = null,
}: Props) {
  const router = useRouter();
  const format = useFormat();
  const searchRef = useRef<HTMLInputElement>(null);

  const [registerId, setRegisterId] = useState(registers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  // The list the chosen customer is on, as the server reports it when the cart is re-priced.
  const [priceListName, setPriceListName] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // A table order starts from what is already on the bill; the key on this component means a
  // different order mounts a fresh screen rather than merging two carts.
  // A booking opens the till with what was booked; an open bill with what is on it.
  const [lines, setLines] = useState<CartLine[]>(() => (order ? orderLines(order, items) : bookingLines(appointment, items, defaultVatRate)));
  const [customerId, setCustomerId] = useState(order?.customerId ?? "");
  const [cartDiscount, setCartDiscount] = useState("0");
  const [note, setNote] = useState(order?.note ?? "");
  const [guests, setGuests] = useState(guestCount === null ? "" : String(guestCount));
  // The order's own id once it exists; the first round creates it.
  const [orderId, setOrderId] = useState(order?.id ?? null);
  const [orderNumber, setOrderNumber] = useState(order?.number ?? null);
  const [payOpen, setPayOpen] = useState(payOnOpen && (order?.lines.length ?? 0) > 0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<string | null>(null);
  // The item waiting on its modifier questions, with the quantity a scale may have decided.
  const [asking, setAsking] = useState<{ item: RegisterItem; quantity?: number } | null>(null);

  // A table and a tab are the same open bill, so one flag drives the whole screen.
  const onBill = table !== null || tabName !== null;
  const billName = table?.name ?? tabName;

  // What this customer is entitled to. The server checks it again on every line that asks.
  const member = customerId ? (memberships[customerId] ?? null) : null;

  const register = registers.find((r) => r.id === registerId) ?? null;
  const openShift = register?.shifts[0] ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId && item.categoryId !== categoryId) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.variantName?.toLowerCase().includes(q) ?? false) ||
        (item.sku?.toLowerCase().includes(q) ?? false) ||
        (item.barcode?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, categoryId]);

  const cartDiscountPercent = Math.min(100, Math.max(0, Number(cartDiscount) || 0));
  // Same arithmetic as the server and the invoice form: line discount then cart discount.
  const totals = calcTotals(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: 100 - ((100 - line.discountPercent) * (100 - cartDiscountPercent)) / 100,
      vatRate: vatEnabled ? line.vatRate : 0,
    })),
  );

  /**
   * Asks the server what this customer pays for what is in the cart, and shows it. Only lines the
   * cashier has not priced by hand are touched, and the engine resolves the same prices again when
   * the sale is recorded — this is what the screen shows, never what is owed.
   */
  async function reprice(nextCustomerId: string, nextLines: CartLine[]) {
    if (!hasPriceLists) return;
    const priceable = nextLines.filter((line) => !line.priceEdited && line.modifiers.length === 0);
    if (priceable.length === 0) {
      setPriceListName(null);
      return;
    }
    const result = await quotePrices({
      customerId: nextCustomerId || null,
      lines: priceable.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPriceListName(result.data.listName);
    setLines((prev) =>
      prev.map((line) => {
        const quoted = result.data.lines.find((row) => row.variantId === line.variantId);
        if (!quoted || line.priceEdited || line.modifiers.length > 0) return line;
        return { ...line, unitPrice: quoted.price, priceSource: quoted.source as CartLine["priceSource"] };
      }),
    );
  }

  /** Routes an item through its modifier questions when it has any, otherwise straight to the cart. */
  function chooseItem(item: RegisterItem, quantity?: number) {
    const groups = itemModifiers[item.itemId] ?? [];
    if (groups.length > 0) {
      setAsking({ item, quantity });
      return;
    }
    addItem(item, quantity);
  }

  /** `quantity` is given for a weighed item, where the scale decided it; otherwise one more. */
  function addItem(item: RegisterItem, quantity?: number, modifiers: ModifierChoice[] = []) {
    const modifierDelta = modifiers.reduce((sum, choice) => sum + choice.priceDelta, 0);
    const signature = modifiers
      .map((choice) => choice.optionId)
      .sort()
      .join("|");
    setLines((prev) => {
      // Two of the same drink with the same options stack; different options stay separate lines.
      const existing = prev.find((line) => line.variantId === item.variantId && modifierSignature(line) === signature);
      if (existing) {
        const next = quantity === undefined ? existing.quantity + 1 : existing.quantity + quantity;
        return prev.map((line) => (line.key === existing.key ? { ...line, quantity: Math.round(next * 1000) / 1000 } : line));
      }
      return [
        ...prev,
        {
          key: `${item.variantId}-${Date.now()}-${signature}`,
          variantId: item.variantId,
          name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
          unit: item.unit,
          unitPrice: Math.round((item.price + modifierDelta) * 100) / 100,
          quantity: quantity === undefined ? 1 : Math.round(quantity * 1000) / 1000,
          discountPercent: 0,
          vatRate: item.vatRate ?? defaultVatRate,
          stock: item.stock,
          trackStock: item.trackStock,
          modifiers,
          // A service added to a booking goes to the person doing the booking unless changed.
          staffId: item.kind === "SERVICE" ? (appointment?.staffId ?? null) : null,
          kind: item.kind,
          useMembership: false,
          priceEdited: false,
          priceSource: "catalogue",
          // A ticket item with exactly one event on sale needs no asking.
          eventId: (events[item.variantId] ?? []).length === 1 ? events[item.variantId][0].id : null,
        },
      ];
    });
  }

/**
   * A scanner types the code and presses Enter. A scale label is recognised first, because it
   * carries a quantity as well as an item; otherwise an exact barcode or SKU, otherwise the single
   * remaining search result.
   */
  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const raw = query.trim();
    if (!raw) return;

    const label = parseScaleBarcode(raw, scale);
    if (label) {
      const weighed = items.find((item) => item.plu && (item.plu === label.plu || item.plu === label.pluTrimmed));
      if (!weighed) {
        toast.error(`No item has PLU ${label.pluTrimmed}. Set it on the product.`);
        return;
      }
      const quantity = scaleQuantity(label, weighed.price);
      if (quantity === null) {
        toast.error(label.mode === "PRICE" ? `${weighed.name} has no price, so the label cannot be converted.` : "That label has no usable weight.");
        return;
      }
      chooseItem(weighed, quantity);
      setQuery("");
      return;
    }

    const q = raw.toLowerCase();
    const exact = items.find((item) => item.barcode?.toLowerCase() === q || item.sku?.toLowerCase() === q || item.plu === raw);
    const target = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (!target) {
      toast.error("No item matches that code.");
      return;
    }
    chooseItem(target);
    setQuery("");
  }

  function setQuantity(key: string, quantity: number) {
    setLines((prev) => {
      const next = prev.map((line) => (line.key === key ? { ...line, quantity: Math.max(0.001, Math.round(quantity * 1000) / 1000) } : line));
      // A quantity break applies the moment the quantity reaches it, so the cart is re-priced.
      void reprice(customerId, next);
      return next;
    });
  }

  function setLineField(key: string, field: "unitPrice" | "discountPercent", value: number) {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key ? { ...line, [field]: Math.max(0, value), ...(field === "unitPrice" ? { priceEdited: true } : {}) } : line,
      ),
    );
  }

  function clearCart() {
    setLines([]);
    setCustomerId("");
    setCartDiscount("0");
    setNote("");
    setResumedFrom(null);
  }

  /**
   * The cart as the server wants it: the base price without the modifier deltas, which it adds
   * back from the options themselves. Nothing here is trusted as a total.
   */
  function cartPayload(options?: { foldCartDiscount?: boolean }) {
    return lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      staffId: line.staffId,
      eventId: line.eventId,
      useMembership: line.useMembership,
      // Only a price the cashier typed is sent; otherwise the server prices the line itself.
      unitPrice: line.priceEdited
        ? Math.round((line.unitPrice - line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0)) * 100) / 100
        : undefined,
      // An order carries no cart-wide figure of its own, so a whole-bill discount is folded into
      // the lines it applies to — the same arithmetic the server uses for a walk-in sale.
      discountPercent: options?.foldCartDiscount
        ? Math.round((100 - ((100 - line.discountPercent) * (100 - cartDiscountPercent)) / 100) * 100) / 100
        : line.discountPercent,
      modifierOptionIds: line.modifiers.map((m) => m.optionId),
    }));
  }

  /** Writes the round onto the table, opening the order if this is the first one. */
  async function sendToTable() {
    if (!onBill) return null;
    const result = await saveOrder({
      saleId: orderId,
      tableId: table?.id ?? null,
      tabName,
      customerId: customerId || null,
      guestCount: guests ? Number(guests) : null,
      note,
      lines: cartPayload({ foldCartDiscount: true }),
    });
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    setOrderId(result.data.id);
    setOrderNumber(result.data.number);
    return result.data.id;
  }

  async function saveTableOrder() {
    setBusy(true);
    try {
      const id = await sendToTable();
      if (!id) return;
      if (!hasKitchen) {
        toast.success(`Saved to ${billName}`);
        router.push(table ? "/pos/tables" : "/pos/tabs");
        return;
      }
      // Where there is a kitchen, saving the round is the same gesture as sending it through.
      const kitchen = await sendOrderToKitchen({ saleId: id });
      if (kitchen.success) {
        toast.success(`Round ${kitchen.data.round} sent to the kitchen`);
      } else {
        // Saving worked; there was simply nothing new to cook.
        toast.message(`Saved to ${billName}`, { description: kitchen.error });
      }
      router.push(table ? "/pos/tables" : "/pos/tabs");
    } finally {
      setBusy(false);
    }
  }

  /** Settles a table's bill: the current round is saved first, then paid off in one go. */
  async function payTableOrder(payments: PaymentDraft[]) {
    setBusy(true);
    try {
      const id = await sendToTable();
      if (!id) return false;
      const result = await payOrder({
        saleId: id,
        registerId: registerId || null,
        payments: payments.map((p) => ({ method: p.method, paymentAccountId: p.paymentAccountId, amount: p.amount, reference: p.reference })),
      });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setReceipt({
        number: result.data.number,
        orderNumber: result.data.orderNumber,
        lines: receiptLines(),
        totals,
        payments,
        changeDue: result.data.changeDue,
        customerName: customers.find((c) => c.id === customerId)?.name ?? null,
        cashierName: currentUserName,
        branchName,
        soldAt: new Date(),
        saleId: result.data.id,
      });
      setLines([]);
      setOrderId(null);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function receiptLines() {
    return lines.map((line) => ({
      name: line.modifiers.length > 0 ? `${line.name} (${line.modifiers.map((m) => m.optionName).join(", ")})` : line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
    }));
  }

  /** Settles a booking: an ordinary sale that also marks the booking paid. */
  async function payBooking(payments: PaymentDraft[]) {
    if (!appointment) return false;
    setBusy(true);
    try {
      const result = await payAppointment({
        appointmentId: appointment.id,
        registerId: registerId || null,
        customerId: customerId || null,
        cartDiscountPercent,
        note,
        lines: cartPayload(),
        payments: payments.map((p) => ({ method: p.method, paymentAccountId: p.paymentAccountId, amount: p.amount, reference: p.reference })),
        park: false,
      });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setReceipt({
        number: result.data.number,
        orderNumber: null,
        lines: receiptLines(),
        totals,
        payments,
        changeDue: result.data.changeDue,
        customerName: appointment.customerName,
        cashierName: currentUserName,
        branchName,
        soldAt: new Date(),
        saleId: result.data.id,
      });
      setLines([]);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  /** Settles a repair job: an ordinary sale that also marks the job paid. */
  async function payJob(payments: PaymentDraft[]) {
    if (!job) return false;
    setBusy(true);
    try {
      const result = await payWorkOrder({
        workOrderId: job.id,
        registerId: registerId || null,
        customerId: customerId || null,
        cartDiscountPercent,
        note,
        lines: cartPayload(),
        payments: payments.map((p) => ({ method: p.method, paymentAccountId: p.paymentAccountId, amount: p.amount, reference: p.reference })),
        park: false,
      });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      setReceipt({
        number: result.data.number,
        orderNumber: null,
        lines: receiptLines(),
        totals,
        payments,
        changeDue: result.data.changeDue,
        customerName: job.customerName,
        cashierName: currentUserName,
        branchName,
        soldAt: new Date(),
        saleId: result.data.id,
      });
      setLines([]);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  /** Settles a room's folio, which is what checking out means. */
  async function settleFolio(payments: PaymentDraft[]) {
    if (!stay) return false;
    setBusy(true);
    try {
      const result = await checkOutStay({
        stayId: stay.id,
        registerId: registerId || null,
        payments: payments.map((p) => ({ method: p.method, paymentAccountId: p.paymentAccountId, amount: p.amount, reference: p.reference })),
      });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      toast.success(`${stay.guestName} checked out — ${result.data.number}`);
      router.push("/pos/rooms");
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function submit(payments: PaymentDraft[], park: boolean) {
    setBusy(true);
    try {
      const result = await completeSale({
        registerId: registerId || null,
        customerId: customerId || null,
        cartDiscountPercent,
        note,
        lines: cartPayload(),
        payments: payments.map((p) => ({ method: p.method, paymentAccountId: p.paymentAccountId, amount: p.amount, reference: p.reference })),
        park,
      });
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      // A held sale that was resumed and then completed must not stay on the hold list.
      if (resumedFrom && !park) await discardSale(resumedFrom);

      if (result.data.kitchenError) {
        // The sale is recorded either way; the kitchen simply has to be told by hand.
        toast.warning("The kitchen was not told about this order", { description: result.data.kitchenError });
      }

      if (park) {
        toast.success(`Held as ${result.data.number}`);
      } else {
        setReceipt({
          number: result.data.number,
          orderNumber: result.data.orderNumber,
          lines: receiptLines(),
          totals,
          payments,
          changeDue: result.data.changeDue,
          customerName: customers.find((c) => c.id === customerId)?.name ?? null,
          cashierName: currentUserName,
          branchName,
          soldAt: new Date(),
          saleId: result.data.id,
        });
      }
      clearCart();
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function resume(sale: ParkedSale) {
    setBusy(true);
    try {
      const result = await resumeSale(sale.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const data = result.data;
      setLines(
        data.lines
          .filter((line) => line.variantId)
          .map((line, index) => {
            const item = items.find((i) => i.variantId === line.variantId);
            return {
              key: `${line.variantId}-${index}`,
              variantId: line.variantId!,
              name: line.name,
              unit: line.unit,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              // The stored discount already includes the whole-sale discount, so it is kept as the
              // line's own figure and the cart discount starts at zero: nothing applies twice.
              discountPercent: line.discountPercent,
              vatRate: line.vatRate || (item?.vatRate ?? defaultVatRate),
              stock: item?.stock ?? null,
              trackStock: item?.trackStock ?? true,
              modifiers: line.modifiers,
              staffId: null,
              kind: item?.kind ?? "PRODUCT",
              useMembership: false,
              // A held sale already carries the price it was held at.
              priceEdited: true,
              priceSource: "catalogue",
              eventId: null,
            };
          }),
      );
      setCartDiscount("0");
      setNote(data.note ?? "");
      setResumedFrom(sale.id);
      toast.success(`${sale.number} resumed`);
    } finally {
      setBusy(false);
    }
  }

  const cashAccountId = register?.cashAccount?.id ?? accounts.find((a) => a.type === "CASH")?.id ?? accounts[0]?.id ?? "";
  const cardAccountId = accounts.find((a) => a.type === "BANK")?.id ?? accounts.find((a) => a.id !== cashAccountId)?.id ?? "";
  // One-tap payment is for a counter that works at speed; a table bill is settled from the floor.
  const quickPay = callsNumbers && !onBill && cashAccountId !== "";

  /** Takes the exact amount in one tap. Everything else still goes through the dialog. */
  async function quickSettle(method: "CASH" | "CARD") {
    const paymentAccountId = method === "CASH" ? cashAccountId : cardAccountId;
    if (!paymentAccountId) {
      toast.error("No account is set up for that payment.");
      return;
    }
    await submit([{ key: "quick", method, paymentAccountId, amount: totals.grandTotal, reference: null }], false);
  }

  const canSell = lines.length > 0 && !busy;

  return (
    <div className="space-y-4">
      <ShiftBar
        registers={registers}
        registerId={registerId}
        onRegisterChange={setRegisterId}
        openShift={openShift ? { id: openShift.id, openedAt: openShift.openedAt, openedByName: openShift.openedByName, openingCash: Number(openShift.openingCash) } : null}
        branchName={branchName}
        posTypeLabel={posTypeLabel}
      />

      {job || stay ? (
        <Card className="border-primary/40 bg-sidebar-accent/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Wrench className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{job ? job.customerName : stay?.guestName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {job ? `${job.number} · ${job.itemName}` : `${stay?.number} · ${stay?.roomName}`}
              </span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push(job ? "/pos/work-orders" : "/pos/rooms")}>
              {job ? "Back to the workshop" : "Back to the front desk"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {appointment ? (
        <Card className="border-primary/40 bg-sidebar-accent/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Utensils className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{appointment.customerName}</span>
              <span className="truncate text-xs text-muted-foreground">Booking with {appointment.staffName}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/pos/appointments")}>
              Back to the diary
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {onBill ? (
        <Card className="border-primary/40 bg-sidebar-accent/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Utensils className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{billName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {orderNumber ? `Order ${orderNumber}` : table ? "New order" : "New tab"}
                {guests ? ` · ${guests} guests` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {table ? (
                <Input
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  inputMode="numeric"
                  placeholder="Guests"
                  className="h-9 w-24"
                  aria-label="How many are seated"
                />
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => router.push(table ? "/pos/tables" : "/pos/tabs")}>
                {table ? "Back to tables" : "Back to tabs"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Catalogue */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              {/**
               * Where the industry scans, the box takes focus so a scanner can type straight into
               * it. Where it does not — a salon, a repair shop — stealing focus only puts a
               * keyboard in the way of tapping a service.
               */}
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={scansCodes ? "Scan a barcode or search…" : "Search the catalogue…"}
                className="h-11 pl-9"
                autoFocus={scansCodes}
              />
            </div>
            {scansCodes ? (
              <Button type="button" variant="outline" className="h-11" onClick={() => searchRef.current?.focus()}>
                <Barcode />
                Scan
              </Button>
            ) : null}
          </div>

          {categories.length > 0 ? (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <CategoryPill label="All" active={categoryId === null} onClick={() => setCategoryId(null)} />
              {categories.map((category) => (
                <CategoryPill key={category.id} label={category.name} active={categoryId === category.id} onClick={() => setCategoryId(category.id)} />
              ))}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "No products or services are active yet." : "Nothing matches that search."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.slice(0, 60).map((item) => {
                const out = item.trackStock && (item.stock ?? 0) <= 0;
                return (
                  <button
                    key={item.variantId}
                    type="button"
                    onClick={() => chooseItem(item)}
                    className={cn(
                      "flex h-28 flex-col justify-between rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50",
                      out && "opacity-60",
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium">{item.variantName ? `${item.name} — ${item.variantName}` : item.name}</span>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {item.kind === "SERVICE" ? <Wrench className="size-3.5" /> : <Package className="size-3.5" />}
                      </span>
                    </span>
                    <span className="flex items-end justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">{format.money(item.price)}</span>
                      <span className={cn("text-xs", out ? "font-medium text-tint-red-foreground" : "text-muted-foreground")}>
                        {item.trackStock ? `${format.number(item.stock ?? 0)} ${item.unit}` : item.unit}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {parked.length > 0 ? (
            <Card>
              <CardContent className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Held sales</p>
                <div className="flex flex-wrap gap-2">
                  {parked.map((sale) => (
                    <Button key={sale.id} type="button" variant="outline" size="sm" disabled={busy} onClick={() => resume(sale)}>
                      <PlayCircle />
                      {sale.number} · {format.money(sale.total)}
                      {sale.customerName ? ` · ${sale.customerName}` : ""}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Cart */}
        <Card className="flex max-h-[calc(100dvh-12rem)] flex-col xl:sticky xl:top-20">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-0">
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShoppingCart className="size-4" />
                Current sale
              </span>
              {lines.length > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearCart} disabled={busy}>
                  <X />
                  Clear
                </Button>
              ) : null}
            </div>

            {priceListName ? (
              <div className="mx-4 rounded-lg bg-tint-blue px-3 py-2 text-xs text-tint-blue-foreground">
                Charging <span className="font-medium">{priceListName}</span> prices
              </div>
            ) : null}

            {/* What this member has left, so the cashier does not have to look it up. */}
            {member ? (
              <div className="mx-4 rounded-lg bg-tint-green px-3 py-2 text-xs text-tint-green-foreground">
                <span className="font-medium">{member.planName}</span>
                {member.sessionsLeft === null ? " · unlimited" : ` · ${member.sessionsLeft} sessions left`}
                {member.discountPercent > 0 ? ` · ${member.discountPercent}% member price` : ""} · to {member.endLabel}
              </div>
            ) : null}

            <div className="min-h-24 flex-1 overflow-y-auto px-4">
              {lines.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Scan or tap an item to start.</p>
              ) : (
                <ul className="divide-y">
                  {lines.map((line) => (
                    <li key={line.key} className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{line.name}</span>
                          {line.modifiers.length > 0 ? (
                            <span className="block text-xs text-muted-foreground">{line.modifiers.map((m) => m.optionName).join(", ")}</span>
                          ) : null}
                        </span>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-lg border">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Less"
                            onClick={() => setQuantity(line.key, line.quantity - (isMeasuredUnit(line.unit) ? 0.1 : 1))}
                          >
                            <Minus />
                          </Button>
                          <Input
                            value={line.quantity}
                            onChange={(e) => setQuantity(line.key, Number(e.target.value) || 0)}
                            inputMode="decimal"
                            className="h-8 w-16 border-0 text-center shadow-none focus-visible:ring-0"
                            aria-label={`Quantity for ${line.name}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="More"
                            onClick={() => setQuantity(line.key, line.quantity + (isMeasuredUnit(line.unit) ? 0.1 : 1))}
                          >
                            <Plus />
                          </Button>
                        </div>
                        <Input
                          value={line.unitPrice}
                          onChange={(e) => setLineField(line.key, "unitPrice", Number(e.target.value) || 0)}
                          inputMode="decimal"
                          className="h-8 w-24"
                          aria-label={`Price for ${line.name}`}
                        />
                        <div className="relative">
                          <Input
                            value={line.discountPercent}
                            onChange={(e) => setLineField(line.key, "discountPercent", Number(e.target.value) || 0)}
                            inputMode="decimal"
                            className="h-8 w-20 pr-6"
                            aria-label={`Discount for ${line.name}`}
                          />
                          <Percent className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted-foreground" />
                        </div>
                        <span className="ml-auto text-right text-sm font-medium tabular-nums">
                          {format.money(line.quantity * line.unitPrice * (1 - line.discountPercent / 100))}
                          {isMeasuredUnit(line.unit) ? (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {format.number(line.quantity)} {line.unit} × {format.money(line.unitPrice)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {line.priceSource === "tier" ? <p className="text-xs text-tint-blue-foreground">Quantity break price</p> : null}
                      {line.trackStock && line.stock !== null && line.quantity > line.stock ? (
                        <p className="text-xs font-medium text-tint-red-foreground">Only {format.number(line.stock)} in stock</p>
                      ) : null}
                      {/*
                        Which event a ticket admits to is part of the line. The server checks there
                        is still room for it when the sale is recorded.
                      */}
                      {(events[line.variantId] ?? []).length > 0 ? (
                        <Select
                          value={line.eventId ?? "none"}
                          onValueChange={(value) =>
                            setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, eventId: value === "none" ? null : value } : l)))
                          }
                        >
                          <SelectTrigger className="h-8 w-full" aria-label={`Which event for ${line.name}`}>
                            <SelectValue placeholder="Which event?" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No event</SelectItem>
                            {(events[line.variantId] ?? []).map((event) => (
                              <SelectItem key={event.id} value={event.id}>
                                {event.name} · {event.placesLeft} left
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                      {/*
                        The membership is asked for, never priced here: the server decides whether
                        it covers this line and what that is worth, and refuses if it does not.
                      */}
                      {member && line.kind === "SERVICE" ? (
                        <Button
                          type="button"
                          variant={line.useMembership ? "secondary" : "outline"}
                          size="sm"
                          aria-pressed={line.useMembership}
                          onClick={() => setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, useMembership: !l.useMembership } : l)))}
                        >
                          <BadgeCheck />
                          {line.useMembership ? "On the membership" : "Use membership"}
                        </Button>
                      ) : null}
                      {/*
                        Who performed it decides whose commission it is, so the till asks on every
                        line — a salon pays on the shampoo it sells as well as on the haircut.
                        Services start with whoever the booking is with; a product starts with nobody.
                      */}
                      {staff.length > 0 ? (
                        <Select
                          value={line.staffId ?? "none"}
                          onValueChange={(value) =>
                            setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, staffId: value === "none" ? null : value } : l)))
                          }
                        >
                          <SelectTrigger className="h-8 w-full" aria-label={`Who performed ${line.name}`}>
                            <SelectValue placeholder="Who performed it?" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No commission</SelectItem>
                            {staff.map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 border-t px-4 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <Combobox
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  value={customerId}
                  onChange={(value) => {
                    setCustomerId(value);
                    void reprice(value, lines);
                  }}
                  placeholder="Walk-in customer"
                  searchPlaceholder="Search customers…"
                />
                <div className="relative">
                  <Input value={cartDiscount} onChange={(e) => setCartDiscount(e.target.value)} inputMode="decimal" className="pr-14" aria-label="Whole sale discount" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">% off</span>
                </div>
              </div>

              <dl className="space-y-1 text-sm">
                <Row label="Subtotal" value={format.money(totals.subtotal)} />
                {totals.discountTotal > 0 ? <Row label="Discount" value={`−${format.money(totals.discountTotal)}`} /> : null}
                {vatEnabled ? <Row label="VAT" value={format.money(totals.vatTotal)} /> : null}
                <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{format.money(totals.grandTotal)}</dd>
                </div>
              </dl>

              <div className="space-y-2 pb-4">
                {/*
                  Quick service takes the money in one tap: the exact amount, to the till's own cash
                  account or the first card account. The dialog is still there for anything else —
                  change, split payments, a reference.
                */}
                {quickPay ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="secondary" className="h-12" disabled={!canSell} onClick={() => quickSettle("CASH")}>
                      {busy ? <Loader2 className="animate-spin" /> : <Banknote />}
                      Cash {format.money(totals.grandTotal)}
                    </Button>
                    <Button type="button" variant="secondary" className="h-12" disabled={!canSell || !cardAccountId} onClick={() => quickSettle("CARD")}>
                      {busy ? <Loader2 className="animate-spin" /> : <CreditCard />}
                      Card {format.money(totals.grandTotal)}
                    </Button>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  {onBill ? (
                    <Button type="button" variant="outline" className="h-12" disabled={!canSell} onClick={saveTableOrder}>
                      {busy ? <Loader2 className="animate-spin" /> : <Utensils />}
                      {hasKitchen ? "Send to kitchen" : table ? "Send to table" : "Save tab"}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="h-12" disabled={!canSell} onClick={() => submit([], true)}>
                      <PauseCircle />
                      Hold
                    </Button>
                  )}
                  <Button type="button" className="h-12 text-base" disabled={!canSell} onClick={() => setPayOpen(true)}>
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    {quickPay ? "Other payment" : "Pay"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        total={totals.grandTotal}
        accounts={accounts}
        defaultCashAccountId={cashAccountId}
        onConfirm={async (payments) => {
          const ok = job
            ? await payJob(payments)
            : stay
              ? await settleFolio(payments)
              : appointment
                ? await payBooking(payments)
                : onBill
                  ? await payTableOrder(payments)
                  : await submit(payments, false);
          if (ok) setPayOpen(false);
          return ok;
        }}
      />

      <ModifierDialog
        item={asking ? { name: asking.item.name, price: asking.item.price, groups: itemModifiers[asking.item.itemId] ?? [] } : null}
        onCancel={() => setAsking(null)}
        onConfirm={(choices) => {
          if (asking) addItem(asking.item, asking.quantity, choices);
          setAsking(null);
        }}
      />

      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} vatEnabled={vatEnabled} />
    </div>
  );
}

/**
 * An open order's stored lines as cart lines. The stored discount already includes any whole-bill
 * discount, so it is kept as the line's own figure and the cart discount starts at zero — nothing
 * is lost or applied twice when the round is saved again.
 */
function orderLines(order: OrderContext | null, items: RegisterItem[]): CartLine[] {
  if (!order) return [];
  return order.lines
    .filter((line) => line.variantId)
    .map((line) => {
      const item = items.find((i) => i.variantId === line.variantId);
      return {
        key: line.id,
        variantId: line.variantId!,
        name: line.name,
        unit: line.unit,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        discountPercent: line.discountPercent,
        vatRate: line.vatRate,
        stock: item?.stock ?? null,
        trackStock: item?.trackStock ?? false,
        modifiers: line.modifiers,
        staffId: line.staffId ?? null,
        kind: item?.kind ?? "PRODUCT",
        useMembership: false,
        priceEdited: true,
        priceSource: "catalogue",
        eventId: null,
      };
    });
}

/**
 * A booking's services as cart lines. Prices are re-read by the server when the sale is recorded;
 * these are what the cashier sees before the customer pays.
 */
function bookingLines(
  appointment: { lines: { variantId: string | null; name: string; price: number; staffId: string }[] } | null,
  items: RegisterItem[],
  defaultVatRate: number,
): CartLine[] {
  if (!appointment) return [];
  return appointment.lines
    .filter((line) => line.variantId)
    .map((line, index) => {
      const item = items.find((i) => i.variantId === line.variantId);
      return {
        key: `booked-${index}`,
        variantId: line.variantId!,
        name: line.name,
        unit: item?.unit ?? "pcs",
        unitPrice: line.price,
        quantity: 1,
        discountPercent: 0,
        vatRate: item?.vatRate ?? defaultVatRate,
        stock: item?.stock ?? null,
        trackStock: item?.trackStock ?? false,
        modifiers: [],
        staffId: line.staffId,
        kind: item?.kind ?? "SERVICE",
        useMembership: false,
        priceEdited: true,
        priceSource: "catalogue",
        eventId: null,
      };
    });
}

/** The options on a line, in a stable order, so matching lines can be compared. */
function modifierSignature(line: CartLine) {
  return line.modifiers
    .map((choice) => choice.optionId)
    .sort()
    .join("|");
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
