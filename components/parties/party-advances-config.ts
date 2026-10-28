import {
  giveBackAdvance,
  recordAdvance,
  returnAdvanceToBalance,
  settleInvoiceFromAdvance,
  withdrawAdvance,
} from "@/actions/advances";
import {
  recordPrepaymentReturned,
  recordSupplierPrepayment,
  returnPrepaymentToBalance,
  settlePurchaseFromPrepayment,
  withdrawSupplierPrepayment,
} from "@/actions/supplier-advances";
import type { ActionResult } from "@/lib/actions";

/**
 * The two sides of the same card.
 *
 * Money held for a customer and money sitting with a supplier are the same feature read in
 * opposite directions, so they are one screen rather than two — the same approach
 * `components/documents/*` takes for the four commercial documents. What differs is only the
 * wording, where a row links, and which Server Action is called; all of that lives here, so the
 * component itself has no idea which party it is showing.
 */

export type PartyKind = "customer" | "supplier";

/** One advance, normalised so the component does not care which table it came from. */
export type PartyAdvanceRow = {
  id: string;
  number: string;
  date: Date;
  status: "OPEN" | "SETTLED" | "CANCELLED";
  accountName: string;
  reference: string | null;
  notes: string | null;
  cancelReason: string | null;
  amount: number;
  appliedTotal: number;
  refundedTotal: number;
  available: number;
  applications: { paymentId: string; amount: number; date: Date; documentId: string; documentNumber: string }[];
  refunds: { id: string; amount: number; date: Date; accountName: string }[];
};

/** An invoice or a purchase with money still owing on it. */
export type SettleableDocument = { id: string; number: string; owing: number };

type RecordArgs = { partyId: string; amount: string; date: string; paymentAccountId: string; reference: string; notes: string };
type SettleArgs = { advanceId: string; documentId: string; amount: string; date: string };
type GiveBackArgs = { advanceId: string; amount: string; date: string; paymentAccountId: string; reference: string };

type Api = {
  record: (args: RecordArgs) => Promise<ActionResult<{ number: string; amount: number }>>;
  settle: (args: SettleArgs) => Promise<ActionResult<{ advanceNumber: string; documentNumber: string; amount: number }>>;
  takeBack: (paymentId: string) => Promise<ActionResult<{ documentNumber: string; amount: number }>>;
  giveBack: (args: GiveBackArgs) => Promise<ActionResult<{ amount: number }>>;
  withdraw: (args: { advanceId: string; reason: string }) => Promise<ActionResult<{ number: string }>>;
};

/** Renames a successful result's fields without touching a failure, which both sides share. */
function mapped<A, B>(result: ActionResult<A>, to: (data: A) => B): ActionResult<B> {
  return result.success ? { success: true, data: to(result.data) } : result;
}

export type PartyAdvanceCopy = {
  cardTitle: string;
  /** Shown when there is money outstanding; takes the formatted amount and the party's name. */
  heldLine: (money: string, party: string) => string;
  blurb: string;
  emptyTitle: string;
  emptyBody: string;
  recordButton: string;
  recordTitle: (party: string) => string;
  recordBlurb: string;
  dateLabel: string;
  accountLabel: string;
  notesHint: string;
  settleButton: string;
  settleTitle: (number: string) => string;
  settleBlurb: string;
  documentLabel: string;
  documentPlaceholder: string;
  documentHref: (id: string) => string;
  settleAction: string;
  giveBackButton: string;
  giveBackTitle: (number: string) => string;
  giveBackBlurb: string;
  giveBackAccountLabel: string;
  giveBackAction: string;
  /** How a refund reads in the history list. */
  refundLine: (money: string, date: string, account: string) => string;
  cancelBlurb: string;
  api: Api;
};

export const PARTY_ADVANCE_COPY: Record<PartyKind, PartyAdvanceCopy> = {
  customer: {
    cardTitle: "Money held in advance",
    heldLine: (money, party) => `${money} of ${party}'s money is held and not yet put against an invoice.`,
    blurb: "Deposits and payments up front, before there is an invoice to put them against.",
    emptyTitle: "No advances yet",
    emptyBody: "Record one when a customer pays before being invoiced.",
    recordButton: "Record an advance",
    recordTitle: (party) => `Record an advance from ${party}`,
    recordBlurb:
      "Money received before there is an invoice for it. It counts as income on the day it arrives, and can settle an invoice later.",
    dateLabel: "Date received",
    accountLabel: "Into which account",
    notesHint: "What the deposit is for.",
    settleButton: "Settle an invoice",
    settleTitle: (number) => `Settle an invoice from ${number}`,
    settleBlurb: "No money moves — it is already in the account. This decides which invoice the customer’s money settles.",
    documentLabel: "Which invoice",
    documentPlaceholder: "Choose an invoice",
    documentHref: (id) => `/sales/invoices/${id}`,
    settleAction: "Settle it",
    giveBackButton: "Give it back",
    giveBackTitle: (number) => `Give back ${number}`,
    giveBackBlurb: "Money leaving the business today. Only what has not already settled an invoice can be returned.",
    giveBackAccountLabel: "Out of which account",
    giveBackAction: "Give it back",
    refundLine: (money, date, account) => `${money} given back on ${date} (${account})`,
    cancelBlurb:
      "For an advance keyed in error. The record stays, but the money comes back out of income and the account balance.",
    api: {
      record: (a) =>
        recordAdvance({
          customerId: a.partyId,
          amount: a.amount,
          date: a.date,
          paymentAccountId: a.paymentAccountId,
          reference: a.reference,
          notes: a.notes,
        }),
      settle: async (a) =>
        mapped(
          await settleInvoiceFromAdvance({ advanceId: a.advanceId, invoiceId: a.documentId, amount: a.amount, date: a.date }),
          (d) => ({ advanceNumber: d.advanceNumber, documentNumber: d.invoiceNumber, amount: d.amount }),
        ),
      takeBack: async (paymentId) =>
        mapped(await returnAdvanceToBalance({ paymentId }), (d) => ({ documentNumber: d.invoiceNumber, amount: d.amount })),
      giveBack: (a) => giveBackAdvance(a),
      withdraw: (a) => withdrawAdvance(a),
    },
  },
  supplier: {
    cardTitle: "Money paid in advance",
    heldLine: (money, party) => `${money} is sitting with ${party} and not yet put against a bill.`,
    blurb: "Deposits and payments up front, before there is a bill to put them against.",
    emptyTitle: "No prepayments yet",
    emptyBody: "Record one when you pay a supplier before being billed.",
    recordButton: "Record a prepayment",
    recordTitle: (party) => `Record a prepayment to ${party}`,
    recordBlurb:
      "Money paid before there is a bill for it. It counts as an expense on the day it leaves, and can settle a purchase later.",
    dateLabel: "Date paid",
    accountLabel: "Out of which account",
    notesHint: "What the deposit is for.",
    settleButton: "Settle a purchase",
    settleTitle: (number) => `Settle a purchase from ${number}`,
    settleBlurb: "No money moves — it has already left the account. This decides which bill the money settles.",
    documentLabel: "Which purchase",
    documentPlaceholder: "Choose a purchase",
    documentHref: (id) => `/procurement/purchases/${id}`,
    settleAction: "Settle it",
    giveBackButton: "Record it coming back",
    giveBackTitle: (number) => `Money back from ${number}`,
    giveBackBlurb: "Money returning to the business today. Only what has not already settled a purchase can come back.",
    giveBackAccountLabel: "Into which account",
    giveBackAction: "Record it",
    refundLine: (money, date, account) => `${money} came back on ${date} (${account})`,
    cancelBlurb:
      "For a prepayment keyed in error. The record stays, but the money comes back out of expenses and the account balance.",
    api: {
      record: (a) =>
        recordSupplierPrepayment({
          supplierId: a.partyId,
          amount: a.amount,
          date: a.date,
          paymentAccountId: a.paymentAccountId,
          reference: a.reference,
          notes: a.notes,
        }),
      settle: async (a) =>
        mapped(
          await settlePurchaseFromPrepayment({ advanceId: a.advanceId, purchaseId: a.documentId, amount: a.amount, date: a.date }),
          (d) => ({ advanceNumber: d.advanceNumber, documentNumber: d.purchaseNumber, amount: d.amount }),
        ),
      takeBack: async (paymentId) =>
        mapped(await returnPrepaymentToBalance({ paymentId }), (d) => ({ documentNumber: d.purchaseNumber, amount: d.amount })),
      giveBack: (a) => recordPrepaymentReturned(a),
      withdraw: (a) => withdrawSupplierPrepayment(a),
    },
  },
};

export const ADVANCE_STATUS = {
  OPEN: { label: "Open", tone: "info" },
  SETTLED: { label: "Settled", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;
